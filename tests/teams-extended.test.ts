import { ok } from 'neverthrow';
import { afterEach, describe, expect, it, vi } from 'vitest';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// Team UUID: bypasses resolveTeam network call (looksLikeId short-circuits)
const TEAM_UUID = '11111111-1111-1111-1111-111111111111';

function makeTeamMock(
  overrides: Partial<{
    id: string;
    name: string;
    key: string;
    description: string | null;
    timezone: string;
    membersFn: ReturnType<typeof vi.fn>;
  }> = {}
) {
  const membersFn =
    overrides.membersFn ??
    vi.fn().mockResolvedValue({
      nodes: [],
      pageInfo: { hasNextPage: false },
    });
  return {
    id: overrides.id ?? TEAM_UUID,
    name: overrides.name ?? 'Engineering',
    key: overrides.key ?? 'ENG',
    description: overrides.description ?? 'The engineering team',
    timezone: overrides.timezone ?? 'UTC',
    members: membersFn,
  };
}

function stdMocks(teamFn: ReturnType<typeof vi.fn>) {
  // resolveTeam with UUID short-circuits (no teams call needed)
  vi.doMock('../src/lib/client/index.js', () => ({
    getClient: vi.fn().mockReturnValue(ok({ team: teamFn })),
    getRequestFn: vi.fn(),
  }));
  vi.doMock('../src/lib/output/json.js', () => ({ printJson: vi.fn() }));
  vi.doMock('../src/lib/output/markdown.js', () => ({
    markdownTable: vi.fn().mockReturnValue(''),
    printMarkdown: vi.fn(),
  }));
  vi.doMock('../src/lib/output/table.js', () => ({
    prettyTable: vi.fn().mockReturnValue(''),
    printTable: vi.fn(),
  }));
  vi.doMock('../src/lib/runner.js', () => ({ exitError: vi.fn() }));
}

async function buildProgram() {
  const { registerTeams } = await import('../src/features/teams/command.js');
  const { Command } = await import('commander');
  const program = new Command();
  program.exitOverride();
  registerTeams(program);
  return program;
}

// ---------------------------------------------------------------------------
// teams get
// ---------------------------------------------------------------------------
describe('teams get', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
    vi.resetModules();
    process.exitCode = undefined;
  });

  it('JSON has all team fields', async () => {
    const teamObj = makeTeamMock();
    const teamFn = vi.fn().mockResolvedValue(teamObj);
    const printJsonCalls: unknown[] = [];

    stdMocks(teamFn);
    vi.doMock('../src/lib/output/json.js', () => ({
      printJson: vi.fn().mockImplementation((d: unknown) => printJsonCalls.push(d)),
    }));

    const program = await buildProgram();
    await program.parseAsync(['node', 'linear', 'teams', 'get', TEAM_UUID, '--json']);

    expect(teamFn).toHaveBeenCalledWith(TEAM_UUID);
    const out = printJsonCalls[0] as { team: Record<string, unknown> };
    expect(out.team).toMatchObject({
      id: TEAM_UUID,
      name: 'Engineering',
      key: 'ENG',
      description: 'The engineering team',
      timezone: 'UTC',
    });
    expect('memberCount' in out.team).toBe(true);
  });

  it('null team calls exitError with NotFoundError', async () => {
    const teamFn = vi.fn().mockResolvedValue(null);
    const exitErrorMock = vi.fn();

    vi.doMock('../src/lib/client/index.js', () => ({
      getClient: vi.fn().mockReturnValue(ok({ team: teamFn })),
      getRequestFn: vi.fn(),
    }));
    vi.doMock('../src/lib/output/json.js', () => ({ printJson: vi.fn() }));
    vi.doMock('../src/lib/output/markdown.js', () => ({
      markdownTable: vi.fn().mockReturnValue(''),
      printMarkdown: vi.fn(),
    }));
    vi.doMock('../src/lib/output/table.js', () => ({
      prettyTable: vi.fn().mockReturnValue(''),
      printTable: vi.fn(),
    }));
    vi.doMock('../src/lib/runner.js', () => ({ exitError: exitErrorMock }));

    const program = await buildProgram();
    await program.parseAsync(['node', 'linear', 'teams', 'get', TEAM_UUID, '--json']);

    expect(exitErrorMock).toHaveBeenCalled();
  });

  it('non-TTY without --json uses markdown output', async () => {
    const teamObj = makeTeamMock();
    const teamFn = vi.fn().mockResolvedValue(teamObj);
    const printMarkdownCalls: unknown[] = [];

    Object.defineProperty(process.stdout, 'isTTY', {
      value: false,
      writable: true,
      configurable: true,
    });

    vi.doMock('../src/lib/client/index.js', () => ({
      getClient: vi.fn().mockReturnValue(ok({ team: teamFn })),
      getRequestFn: vi.fn(),
    }));
    vi.doMock('../src/lib/output/json.js', () => ({ printJson: vi.fn() }));
    vi.doMock('../src/lib/output/markdown.js', () => ({
      markdownTable: vi.fn().mockReturnValue('MD'),
      printMarkdown: vi.fn().mockImplementation((s: unknown) => printMarkdownCalls.push(s)),
    }));
    vi.doMock('../src/lib/output/table.js', () => ({
      prettyTable: vi.fn().mockReturnValue(''),
      printTable: vi.fn(),
    }));
    vi.doMock('../src/lib/runner.js', () => ({ exitError: vi.fn() }));

    const program = await buildProgram();
    await program.parseAsync(['node', 'linear', 'teams', 'get', TEAM_UUID]);

    expect(printMarkdownCalls.length).toBeGreaterThan(0);
  });
});
