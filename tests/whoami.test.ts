import { ok } from 'neverthrow';
import { afterEach, describe, expect, it, vi } from 'vitest';

const mockViewer = { id: 'u1', name: 'Alice', email: 'alice@example.com' };
const mockOrg = { id: 'org1', name: 'Acme Corp', urlKey: 'acme' };

const mockQueryResponse = {
  viewer: mockViewer,
  organization: mockOrg,
};

function stdMocks(request: ReturnType<typeof vi.fn>) {
  vi.doMock('../src/lib/client/index.js', () => ({
    getClient: vi.fn().mockReturnValue(ok({ client: { request } })),
    getRequestFn: (c: { client: { request: typeof request } }) => c.client.request,
  }));
  vi.doMock('../src/lib/output/json.js', () => ({ printJson: vi.fn() }));
  vi.doMock('../src/lib/output/markdown.js', () => ({
    markdownTable: vi.fn().mockReturnValue('MD_TABLE'),
    printMarkdown: vi.fn(),
  }));
  vi.doMock('../src/lib/output/table.js', () => ({
    prettyTable: vi.fn().mockReturnValue('PRETTY_TABLE'),
    printTable: vi.fn(),
  }));
  vi.doMock('../src/lib/runner.js', () => ({ exitError: vi.fn() }));
}

async function buildProgram() {
  const { registerWhoami } = await import('../src/features/auth/whoami.js');
  const { Command } = await import('commander');
  const program = new Command();
  program.exitOverride();
  registerWhoami(program);
  return program;
}

describe('whoami command', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
    vi.resetModules();
    process.exitCode = undefined;
  });

  it('uses prettyTable when stdout is a TTY (default path)', async () => {
    Object.defineProperty(process.stdout, 'isTTY', { value: true, writable: true, configurable: true });
    const request = vi.fn().mockResolvedValue(mockQueryResponse);
    stdMocks(request);

    const printTableCalls: unknown[] = [];
    vi.doMock('../src/lib/output/table.js', () => ({
      prettyTable: vi.fn().mockReturnValue('PRETTY_TABLE'),
      printTable: vi.fn().mockImplementation((s: unknown) => printTableCalls.push(s)),
    }));

    const program = await buildProgram();
    await program.parseAsync(['node', 'linear', 'whoami', '--api-key', 'test-key']);

    expect(printTableCalls.length).toBeGreaterThan(0);
    expect(printTableCalls[0]).toBe('PRETTY_TABLE');
  });

  it('uses markdownTable when stdout is NOT a TTY', async () => {
    Object.defineProperty(process.stdout, 'isTTY', { value: false, writable: true, configurable: true });
    const request = vi.fn().mockResolvedValue(mockQueryResponse);
    stdMocks(request);

    const printMarkdownCalls: unknown[] = [];
    vi.doMock('../src/lib/output/markdown.js', () => ({
      markdownTable: vi.fn().mockReturnValue('MD_TABLE'),
      printMarkdown: vi.fn().mockImplementation((s: unknown) => printMarkdownCalls.push(s)),
    }));

    const program = await buildProgram();
    await program.parseAsync(['node', 'linear', 'whoami', '--api-key', 'test-key']);

    expect(printMarkdownCalls.length).toBeGreaterThan(0);
    expect(printMarkdownCalls[0]).toBe('MD_TABLE');
  });

  it('table output includes workspace row', async () => {
    Object.defineProperty(process.stdout, 'isTTY', { value: true, writable: true, configurable: true });
    const request = vi.fn().mockResolvedValue(mockQueryResponse);
    stdMocks(request);

    let capturedRows: string[][] = [];
    vi.doMock('../src/lib/output/table.js', () => ({
      prettyTable: vi.fn().mockImplementation((_headers: string[], rows: string[][]) => {
        capturedRows = rows;
        return 'PRETTY_TABLE';
      }),
      printTable: vi.fn(),
    }));

    const program = await buildProgram();
    await program.parseAsync(['node', 'linear', 'whoami', '--api-key', 'test-key']);

    const workspaceRow = capturedRows.find((r) => r[0] === 'Workspace');
    expect(workspaceRow).toBeDefined();
    expect(workspaceRow?.[1]).toBe('Acme Corp');
  });

  it('calls printJson when --json flag is used', async () => {
    const request = vi.fn().mockResolvedValue(mockQueryResponse);
    stdMocks(request);

    const jsonOutputs: unknown[] = [];
    vi.doMock('../src/lib/output/json.js', () => ({
      printJson: vi.fn().mockImplementation((d: unknown) => jsonOutputs.push(d)),
    }));

    const program = await buildProgram();
    await program.parseAsync(['node', 'linear', 'whoami', '--api-key', 'test-key', '--json']);

    expect(jsonOutputs[0]).toMatchObject({
      id: 'u1',
      name: 'Alice',
      email: 'alice@example.com',
      workspace: 'Acme Corp',
    });
  });

  it('--json output includes user id', async () => {
    const request = vi.fn().mockResolvedValue(mockQueryResponse);
    stdMocks(request);

    const jsonOutputs: unknown[] = [];
    vi.doMock('../src/lib/output/json.js', () => ({
      printJson: vi.fn().mockImplementation((d: unknown) => jsonOutputs.push(d)),
    }));

    const program = await buildProgram();
    await program.parseAsync(['node', 'linear', 'whoami', '--api-key', 'test-key', '--json']);

    const out = jsonOutputs[0] as { id: string };
    expect(out.id).toBe('u1');
  });

  it('fetches viewer and organization in a single request', async () => {
    const request = vi.fn().mockResolvedValue(mockQueryResponse);
    stdMocks(request);

    const program = await buildProgram();
    await program.parseAsync(['node', 'linear', 'whoami', '--api-key', 'test-key', '--json']);

    expect(request).toHaveBeenCalledOnce();
    const [query] = request.mock.calls[0] as [string, unknown];
    expect(query).toContain('viewer');
    expect(query).toContain('organization');
  });
});
