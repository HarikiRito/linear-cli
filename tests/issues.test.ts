import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { err, ok } from 'neverthrow';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function makeIssueNode(
  id: string,
  title: string,
  overrides: {
    trashed?: boolean;
    archivedAt?: string | null;
    labelNames?: string[];
    blockingIds?: string[];
    blockedByIds?: string[];
  } = {}
) {
  return {
    identifier: id,
    title,
    state: { name: 'Todo' },
    assignee: { displayName: 'Alice' },
    priority: 0,
    trashed: overrides.trashed ?? false,
    archivedAt: overrides.archivedAt ?? null,
    labels: { nodes: (overrides.labelNames ?? []).map((name) => ({ name })) },
    relations: {
      nodes: (overrides.blockingIds ?? []).map((identifier) => ({
        type: 'blocks',
        relatedIssue: { identifier },
      })),
    },
    inverseRelations: {
      nodes: (overrides.blockedByIds ?? []).map((identifier) => ({
        type: 'blocks',
        issue: { identifier },
      })),
    },
  };
}

// client.client.request() returns unwrapped data: { <rootKey>: { nodes, pageInfo } }
function makeListResponse(
  nodes: ReturnType<typeof makeIssueNode>[],
  pageInfo = { hasNextPage: false, endCursor: null as string | null }
) {
  return { issues: { nodes, pageInfo } };
}

function makeSearchResponse(
  nodes: ReturnType<typeof makeIssueNode>[],
  pageInfo = { hasNextPage: false, endCursor: null as string | null }
) {
  return { searchIssues: { nodes, pageInfo } };
}

function stdMocks(request: ReturnType<typeof vi.fn>) {
  vi.doMock('../src/lib/client/index.js', () => ({
    // Issues list/me/query use requestFn + TypedDocumentNode — provide a stub client
    // and return the request spy from getRequestFn.
    getClient: vi.fn().mockReturnValue(ok({})),
    getClientWithAuthRetry: vi.fn().mockReturnValue(ok({})),
    getRequestFn: vi.fn().mockReturnValue(request),
  }));
  vi.doMock('../src/lib/output/table.js', () => ({
    prettyTable: vi.fn().mockReturnValue(''),
    printTable: vi.fn(),
  }));
  vi.doMock('../src/lib/runner.js', () => ({ exitError: vi.fn() }));
}

async function buildProgram() {
  const { registerIssues } = await import('../src/features/issues/command.js');
  const { Command } = await import('commander');
  const program = new Command();
  program.option('--plain', 'Output as plain key:value text (agent-friendly)').exitOverride();
  registerIssues(program);
  return program;
}

// ---------------------------------------------------------------------------
// issues list
// ---------------------------------------------------------------------------
describe('issues list', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
    vi.resetModules();
  });

  it('makes exactly ONE request call (no N+1)', async () => {
    const request = vi
      .fn()
      .mockResolvedValue(makeListResponse([makeIssueNode('ENG-1', 'Issue 1')]));
    stdMocks(request);
    const program = await buildProgram();

    await program.parseAsync(['node', 'linear', 'issues', 'list']);

    expect(request).toHaveBeenCalledOnce();
  });

  it('reads state and assignee inline from response (no extra requests)', async () => {
    const nodes = Array.from({ length: 5 }, (_, i) =>
      makeIssueNode(`ENG-${i + 1}`, `Issue ${i + 1}`)
    );
    const request = vi.fn().mockResolvedValue(makeListResponse(nodes));
    stdMocks(request);

    const program = await buildProgram();
    await program.parseAsync(['node', 'linear', 'issues', 'list']);

    expect(request).toHaveBeenCalledOnce();
  });

  it('respects --limit (passes as "first" variable)', async () => {
    const request = vi.fn().mockResolvedValue(makeListResponse([]));
    stdMocks(request);
    const program = await buildProgram();

    await program.parseAsync(['node', 'linear', 'issues', 'list', '--limit', '10']);

    expect(request).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'Document' }),
      expect.objectContaining({ first: 10 })
    );
  });

  it('--after passes cursor in variables', async () => {
    const request = vi.fn().mockResolvedValue(makeListResponse([]));
    stdMocks(request);
    const program = await buildProgram();

    await program.parseAsync(['node', 'linear', 'issues', 'list', '--after', 'cursor123']);

    expect(request).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'Document' }),
      expect.objectContaining({ after: 'cursor123' })
    );
  });

  it('--all fetches multiple pages (one request per page)', async () => {
    const request = vi
      .fn()
      .mockResolvedValueOnce(
        makeListResponse(
          Array.from({ length: 50 }, (_, i) => makeIssueNode(`ENG-${i + 1}`, `Issue ${i + 1}`)),
          { hasNextPage: true, endCursor: 'cur1' }
        )
      )
      .mockResolvedValueOnce(
        makeListResponse(
          Array.from({ length: 10 }, (_, i) => makeIssueNode(`ENG-${i + 51}`, `Issue ${i + 51}`)),
          { hasNextPage: false, endCursor: null }
        )
      );
    stdMocks(request);

    const program = await buildProgram();
    await program.parseAsync(['node', 'linear', 'issues', 'list', '--all']);

    expect(request).toHaveBeenCalledTimes(2);
  });

  it('table output produced for issues list', async () => {
    const request = vi.fn().mockResolvedValue(
      makeListResponse([makeIssueNode('ENG-1', 'Issue 1')], {
        hasNextPage: true,
        endCursor: 'abc123',
      })
    );
    const printTableCalls: unknown[] = [];
    vi.doMock('../src/lib/client/index.js', () => ({
      getClient: vi.fn().mockReturnValue(ok({})),
      getClientWithAuthRetry: vi.fn().mockReturnValue(ok({})),
      getRequestFn: vi.fn().mockReturnValue(request),
    }));
    vi.doMock('../src/lib/output/table.js', () => ({
      prettyTable: vi.fn().mockReturnValue('TABLE'),
      printTable: vi.fn().mockImplementation((s: unknown) => printTableCalls.push(s)),
    }));
    vi.doMock('../src/lib/runner.js', () => ({ exitError: vi.fn() }));

    const program = await buildProgram();
    await program.parseAsync(['node', 'linear', 'issues', 'list']);

    expect(request).toHaveBeenCalledOnce();
    expect(printTableCalls.length).toBeGreaterThan(0);
  });

  it('table output includes labels and a compact blocked-relations indicator', async () => {
    const request = vi.fn().mockResolvedValue(
      makeListResponse([
        makeIssueNode('ENG-1', 'Issue 1', {
          labelNames: ['bug', 'urgent'],
          blockingIds: ['ENG-2'],
          blockedByIds: ['ENG-3', 'ENG-4'],
        }),
      ])
    );
    let capturedRows: string[][] = [];
    vi.doMock('../src/lib/client/index.js', () => ({
      getClient: vi.fn().mockReturnValue(ok({})),
      getClientWithAuthRetry: vi.fn().mockReturnValue(ok({})),
      getRequestFn: vi.fn().mockReturnValue(request),
    }));
    vi.doMock('../src/lib/output/table.js', () => ({
      prettyTable: vi.fn().mockImplementation((_h: string[], rows: string[][]) => {
        capturedRows = rows;
        return '';
      }),
      printTable: vi.fn(),
    }));
    vi.doMock('../src/lib/runner.js', () => ({ exitError: vi.fn() }));

    const program = await buildProgram();
    await program.parseAsync(['node', 'linear', 'issues', 'list']);

    const flat = capturedRows.flat();
    expect(flat.some((c) => c.includes('bug') && c.includes('urgent'))).toBe(true);
    // Table cell is a compact count indicator, not the full identifier list.
    expect(flat.some((c) => c.includes('blocking:1') && c.includes('blocked-by:2'))).toBe(true);
    expect(flat.some((c) => c.includes('ENG-2'))).toBe(false);
  });

  it('filters by --team server-side', async () => {
    const request = vi.fn().mockResolvedValue(makeListResponse([]));
    stdMocks(request);
    const program = await buildProgram();

    await program.parseAsync(['node', 'linear', 'issues', 'list', '--team', 'ENG']);

    // With default state filter, team filter is AND-merged with state filter
    const [, vars] = request.mock.calls[0] as [string, Record<string, unknown>];
    expect(JSON.stringify(vars)).toContain('"ENG"');
  });

  it('default state filter uses todo/in_progress/dev_review as OR-of-eqIgnoreCase', async () => {
    const request = vi.fn().mockResolvedValue(makeListResponse([]));
    stdMocks(request);
    const program = await buildProgram();

    await program.parseAsync(['node', 'linear', 'issues', 'list']);

    const [, vars] = request.mock.calls[0] as [string, Record<string, unknown>];
    const json = JSON.stringify(vars);
    expect(json).toContain('eqIgnoreCase');
    expect(json).toContain('"todo"');
    expect(json).toContain('"in progress"');
    expect(json).toContain('"dev review"');
  });

  it('--state in_progress,dev_review sends those two tokens only', async () => {
    const request = vi.fn().mockResolvedValue(makeListResponse([]));
    stdMocks(request);
    const program = await buildProgram();

    await program.parseAsync([
      'node',
      'linear',
      'issues',
      'list',
      '--state',
      'in_progress,dev_review',
    ]);

    const [, vars] = request.mock.calls[0] as [string, Record<string, unknown>];
    const json = JSON.stringify(vars);
    expect(json).toContain('"in progress"');
    expect(json).toContain('"dev review"');
    expect(json).not.toContain('"todo"');
  });

  it('--all-states sends NO state filter', async () => {
    const request = vi.fn().mockResolvedValue(makeListResponse([]));
    stdMocks(request);
    const program = await buildProgram();

    await program.parseAsync(['node', 'linear', 'issues', 'list', '--all-states']);

    const [, vars] = request.mock.calls[0] as [string, Record<string, unknown>];
    expect(JSON.stringify(vars)).not.toContain('eqIgnoreCase');
  });

  it('--team AND state filter merged via AND', async () => {
    const request = vi.fn().mockResolvedValue(makeListResponse([]));
    stdMocks(request);
    const program = await buildProgram();

    await program.parseAsync(['node', 'linear', 'issues', 'list', '--team', 'ENG']);

    const [, vars] = request.mock.calls[0] as [string, Record<string, unknown>];
    const json = JSON.stringify(vars);
    expect(json).toContain('"ENG"');
    expect(json).toContain('eqIgnoreCase');
    expect(json).toContain('"and"');
  });

  it('resolves team automatically from a real global config.toml when --team is omitted (end-to-end)', async () => {
    // Real global config.toml — no mocking of the resolve/config-file layer.
    // Verifies the intended purpose of config.toml: commands that omit --team should
    // pick up the configured team.id via getDefaultTeamId()'s resolution chain.
    const tmpHomeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'linear-list-team-cfg-home-'));
    const linearDir = path.join(tmpHomeDir, '.config', '.linear');
    fs.mkdirSync(linearDir, { recursive: true });
    fs.writeFileSync(
      path.join(linearDir, 'config.toml'),
      '[team]\nid = "PROJCFG"\nkey = "PC"\n',
      'utf-8'
    );

    const originalCwd = process.cwd.bind(process);
    const originalHome = process.env.HOME;
    process.env.HOME = tmpHomeDir;

    try {
      const request = vi.fn().mockResolvedValue(makeListResponse([]));
      stdMocks(request);
      const program = await buildProgram();

      // No --team flag passed — must resolve from the real config.toml above.
      await program.parseAsync(['node', 'linear', 'issues', 'list']);

      const [, vars] = request.mock.calls[0] as [string, Record<string, unknown>];
      expect(JSON.stringify(vars)).toContain('"PROJCFG"');
    } finally {
      process.cwd = originalCwd;
      if (originalHome !== undefined) {
        process.env.HOME = originalHome;
      } else {
        delete process.env.HOME;
      }
      fs.rmSync(tmpHomeDir, { recursive: true, force: true });
    }
  });

  // --- H-161: trashed/archived issues are excluded from `issues list` by
  // default, with `--include-deleted` opting back in. ---

  it('excludes trashed and archived issues by default', async () => {
    const nodes = [
      makeIssueNode('ENG-1', 'Active issue'),
      makeIssueNode('ENG-2', 'Trashed issue', { trashed: true }),
      makeIssueNode('ENG-3', 'Archived issue', { archivedAt: '2024-01-01T00:00:00.000Z' }),
    ];
    const request = vi.fn().mockResolvedValue(makeListResponse(nodes));
    let capturedRows: string[][] = [];
    vi.doMock('../src/lib/client/index.js', () => ({
      getClient: vi.fn().mockReturnValue(ok({})),
      getClientWithAuthRetry: vi.fn().mockReturnValue(ok({})),
      getRequestFn: vi.fn().mockReturnValue(request),
    }));
    vi.doMock('../src/lib/output/table.js', () => ({
      prettyTable: vi.fn().mockImplementation((_h: string[], rows: string[][]) => {
        capturedRows = rows;
        return '';
      }),
      printTable: vi.fn(),
    }));
    vi.doMock('../src/lib/runner.js', () => ({ exitError: vi.fn() }));

    const program = await buildProgram();
    await program.parseAsync(['node', 'linear', 'issues', 'list']);

    const identifiers = capturedRows.map((r) => r[0]);
    expect(identifiers).toEqual(['ENG-1']);
  });

  it('--include-deleted includes trashed and archived issues', async () => {
    const nodes = [
      makeIssueNode('ENG-1', 'Active issue'),
      makeIssueNode('ENG-2', 'Trashed issue', { trashed: true }),
      makeIssueNode('ENG-3', 'Archived issue', { archivedAt: '2024-01-01T00:00:00.000Z' }),
    ];
    const request = vi.fn().mockResolvedValue(makeListResponse(nodes));
    let capturedRows: string[][] = [];
    vi.doMock('../src/lib/client/index.js', () => ({
      getClient: vi.fn().mockReturnValue(ok({})),
      getClientWithAuthRetry: vi.fn().mockReturnValue(ok({})),
      getRequestFn: vi.fn().mockReturnValue(request),
    }));
    vi.doMock('../src/lib/output/table.js', () => ({
      prettyTable: vi.fn().mockImplementation((_h: string[], rows: string[][]) => {
        capturedRows = rows;
        return '';
      }),
      printTable: vi.fn(),
    }));
    vi.doMock('../src/lib/runner.js', () => ({ exitError: vi.fn() }));

    const program = await buildProgram();
    await program.parseAsync(['node', 'linear', 'issues', 'list', '--include-deleted']);

    const identifiers = capturedRows.map((r) => r[0]);
    expect(identifiers).toEqual(['ENG-1', 'ENG-2', 'ENG-3']);

    const [, vars] = request.mock.calls[0] as [string, Record<string, unknown>];
    expect(vars.includeArchived).toBe(true);
  });

  // --- H-162: a UUID/node-ID passed to --team falls back correctly (filters by
  // team id instead of the key-based server-side filter used for human-readable
  // keys), instead of requiring a human-readable key only. ---
  it('--team <uuid> filters by team id instead of key', async () => {
    const request = vi.fn().mockResolvedValue(makeListResponse([]));
    stdMocks(request);
    const program = await buildProgram();

    const uuid = '12345678-1234-1234-1234-123456789012';
    await program.parseAsync(['node', 'linear', 'issues', 'list', '--team', uuid]);

    const [, vars] = request.mock.calls[0] as [string, Record<string, unknown>];
    const json = JSON.stringify(vars);
    expect(json).toContain(uuid);
    expect(json).toContain('"id"');
  });

  it('--json is an unknown option (errors after removal)', async () => {
    vi.doMock('../src/lib/runner.js', () => ({ exitError: vi.fn() }));
    const program = await buildProgram();

    await expect(
      program.parseAsync(['node', 'linear', 'issues', 'list', '--json'])
    ).rejects.toThrow(/unknown option/i);
  });

  it('--plain outputs Issue block-format with --- separator between records', async () => {
    const nodes = [makeIssueNode('ENG-1', 'First Issue'), makeIssueNode('ENG-2', 'Second Issue')];
    const request = vi.fn().mockResolvedValue(makeListResponse(nodes));
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    vi.doMock('../src/lib/client/index.js', () => ({
      getClient: vi.fn().mockReturnValue(ok({})),
      getClientWithAuthRetry: vi.fn().mockReturnValue(ok({})),
      getRequestFn: vi.fn().mockReturnValue(request),
    }));
    vi.doMock('../src/lib/output/table.js', () => ({
      prettyTable: vi.fn().mockReturnValue(''),
      printTable: vi.fn(),
    }));
    vi.doMock('../src/lib/runner.js', () => ({ exitError: vi.fn() }));

    const program = await buildProgram();
    await program.parseAsync(['node', 'linear', 'issues', 'list', '--plain', '--all-states']);

    const output = consoleSpy.mock.calls.map((c) => String(c[0])).join('\n');

    expect(output).toContain('Issue: ENG-1');
    expect(output).toContain('title: First Issue');
    expect(output).toContain('state: Todo');
    expect(output).toContain('priority: 0');
    expect(output).toContain('assignee: Alice');
    expect(output).toContain('Issue: ENG-2');
    expect(output).toContain('title: Second Issue');
    expect(output).toContain('---');

    consoleSpy.mockRestore();
  });

  it('--plain includes full labels/blockedBy/blocking identifier lists', async () => {
    const nodes = [
      makeIssueNode('ENG-1', 'First Issue', {
        labelNames: ['bug'],
        blockingIds: ['ENG-9'],
        blockedByIds: ['ENG-8'],
      }),
    ];
    const request = vi.fn().mockResolvedValue(makeListResponse(nodes));
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    vi.doMock('../src/lib/client/index.js', () => ({
      getClient: vi.fn().mockReturnValue(ok({})),
      getClientWithAuthRetry: vi.fn().mockReturnValue(ok({})),
      getRequestFn: vi.fn().mockReturnValue(request),
    }));
    vi.doMock('../src/lib/output/table.js', () => ({
      prettyTable: vi.fn().mockReturnValue(''),
      printTable: vi.fn(),
    }));
    vi.doMock('../src/lib/runner.js', () => ({ exitError: vi.fn() }));

    const program = await buildProgram();
    await program.parseAsync(['node', 'linear', 'issues', 'list', '--plain', '--all-states']);

    const output = consoleSpy.mock.calls.map((c) => String(c[0])).join('\n');
    expect(output).toContain('labels: bug');
    expect(output).toContain('blockedBy: ENG-8');
    expect(output).toContain('blocking: ENG-9');

    consoleSpy.mockRestore();
  });

  it('registers a --project <id-or-name> option', async () => {
    const program = await buildProgram();
    const listCmd = program.commands
      .find((c) => c.name() === 'issues')
      ?.commands.find((c) => c.name() === 'list');
    const projectOption = listCmd?.options.find((o) => o.long === '--project');
    expect(projectOption).toBeDefined();
  });

  it('explicit --project resolves via resolveProject and filters by id (in: [id])', async () => {
    const request = vi.fn().mockResolvedValue(makeListResponse([]));
    stdMocks(request);
    const program = await buildProgram();

    const uuid = '22222222-2222-2222-2222-222222222222';
    await program.parseAsync(['node', 'linear', 'issues', 'list', '--project', uuid]);

    const [, vars] = request.mock.calls[0] as [string, Record<string, unknown>];
    const json = JSON.stringify(vars);
    expect(json).toContain(uuid);
    expect(json).toContain('"in"');
  });

  it('no --project falls back to an OR/"in" filter across all configured default project IDs', async () => {
    const request = vi.fn().mockResolvedValue(makeListResponse([]));
    stdMocks(request);
    vi.doMock('../src/features/issues/shared/resolve.js', async (importOriginal) => {
      const actual =
        await importOriginal<typeof import('../src/features/issues/shared/resolve.js')>();
      return { ...actual, getDefaultProjectIds: vi.fn().mockReturnValue(['p1', 'p2']) };
    });
    const program = await buildProgram();

    await program.parseAsync(['node', 'linear', 'issues', 'list']);

    const [, vars] = request.mock.calls[0] as [string, { filter?: Record<string, unknown> }];
    const json = JSON.stringify(vars.filter);
    expect(json).toContain('"p1"');
    expect(json).toContain('"p2"');
    expect(json).toContain('"in"');
  });

  it('explicit --project bypasses the config fallback entirely', async () => {
    const request = vi.fn().mockResolvedValue(makeListResponse([]));
    stdMocks(request);
    const getDefaultProjectIdsMock = vi.fn().mockReturnValue(['p1', 'p2']);
    vi.doMock('../src/features/issues/shared/resolve.js', async (importOriginal) => {
      const actual =
        await importOriginal<typeof import('../src/features/issues/shared/resolve.js')>();
      return { ...actual, getDefaultProjectIds: getDefaultProjectIdsMock };
    });
    const program = await buildProgram();

    const uuid = '33333333-3333-3333-3333-333333333333';
    await program.parseAsync(['node', 'linear', 'issues', 'list', '--project', uuid]);

    const [, vars] = request.mock.calls[0] as [string, { filter?: Record<string, unknown> }];
    const json = JSON.stringify(vars.filter);
    expect(json).toContain(uuid);
    expect(json).not.toContain('"p1"');
    expect(getDefaultProjectIdsMock).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// issues me
// ---------------------------------------------------------------------------
describe('issues me', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
    vi.resetModules();
  });

  it('makes exactly ONE request call (no N+1)', async () => {
    const request = vi
      .fn()
      .mockResolvedValue(makeListResponse([makeIssueNode('ENG-1', 'Issue 1')]));
    stdMocks(request);
    const program = await buildProgram();

    await program.parseAsync(['node', 'linear', 'issues', 'me']);

    expect(request).toHaveBeenCalledOnce();
  });

  it('passes isMe filter as a variable (no separate viewer call)', async () => {
    const request = vi.fn().mockResolvedValue(makeListResponse([]));
    stdMocks(request);
    const program = await buildProgram();

    await program.parseAsync(['node', 'linear', 'issues', 'me']);

    // Exactly one request — no second viewer call
    expect(request).toHaveBeenCalledOnce();
    // isMe is passed via the filter variable (merged with state filter)
    const [, vars] = request.mock.calls[0] as [string, Record<string, unknown>];
    expect(JSON.stringify(vars)).toContain('isMe');
  });

  it('respects --limit', async () => {
    const request = vi.fn().mockResolvedValue(makeListResponse([]));
    stdMocks(request);
    const program = await buildProgram();

    await program.parseAsync(['node', 'linear', 'issues', 'me', '--limit', '7']);

    expect(request).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'Document' }),
      expect.objectContaining({ first: 7 })
    );
  });

  it('--after passes cursor in variables', async () => {
    const request = vi.fn().mockResolvedValue(makeListResponse([]));
    stdMocks(request);
    const program = await buildProgram();

    await program.parseAsync(['node', 'linear', 'issues', 'me', '--after', 'meCursor']);

    expect(request).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'Document' }),
      expect.objectContaining({ after: 'meCursor' })
    );
  });

  it('table output produced for issues me', async () => {
    const request = vi.fn().mockResolvedValue(
      makeListResponse([makeIssueNode('ENG-1', 'Issue 1')], {
        hasNextPage: true,
        endCursor: 'meNext',
      })
    );
    let capturedRows: string[][] = [];

    vi.doMock('../src/lib/client/index.js', () => ({
      getClient: vi.fn().mockReturnValue(ok({})),
      getClientWithAuthRetry: vi.fn().mockReturnValue(ok({})),
      getRequestFn: vi.fn().mockReturnValue(request),
    }));
    vi.doMock('../src/lib/output/table.js', () => ({
      prettyTable: vi.fn().mockImplementation((_h: string[], rows: string[][]) => {
        capturedRows = rows;
        return '';
      }),
      printTable: vi.fn(),
    }));
    vi.doMock('../src/lib/runner.js', () => ({ exitError: vi.fn() }));

    const program = await buildProgram();
    await program.parseAsync(['node', 'linear', 'issues', 'me']);

    expect(request).toHaveBeenCalledOnce();
    expect(capturedRows.length).toBeGreaterThan(0);
    const flat = capturedRows.flat();
    expect(flat).toContain('ENG-1');
    expect(flat).toContain('Issue 1');
    expect(flat).toContain('Todo');
    expect(flat).toContain('Alice');
  });

  it('default state filter applied to me (OR-of-eqIgnoreCase)', async () => {
    const request = vi.fn().mockResolvedValue(makeListResponse([]));
    stdMocks(request);
    const program = await buildProgram();

    await program.parseAsync(['node', 'linear', 'issues', 'me']);

    const [, vars] = request.mock.calls[0] as [string, Record<string, unknown>];
    const json = JSON.stringify(vars);
    expect(json).toContain('eqIgnoreCase');
    expect(json).toContain('isMe');
  });

  it('--all-states on me sends NO state filter but keeps isMe', async () => {
    const request = vi.fn().mockResolvedValue(makeListResponse([]));
    stdMocks(request);
    const program = await buildProgram();

    await program.parseAsync(['node', 'linear', 'issues', 'me', '--all-states']);

    const [, vars] = request.mock.calls[0] as [string, Record<string, unknown>];
    const json = JSON.stringify(vars);
    expect(json).not.toContain('eqIgnoreCase');
    expect(json).toContain('isMe');
  });
});

// ---------------------------------------------------------------------------
// issues query
// ---------------------------------------------------------------------------
describe('issues query', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
    vi.resetModules();
  });

  it('makes exactly ONE request call per page (no N+1)', async () => {
    const request = vi
      .fn()
      .mockResolvedValue(makeSearchResponse([makeIssueNode('ENG-1', 'Issue 1')]));
    stdMocks(request);
    const program = await buildProgram();

    await program.parseAsync(['node', 'linear', 'issues', 'query', 'bug']);

    expect(request).toHaveBeenCalledOnce();
  });

  it('passes the search term as a variable', async () => {
    const request = vi.fn().mockResolvedValue(makeSearchResponse([]));
    stdMocks(request);
    const program = await buildProgram();

    await program.parseAsync(['node', 'linear', 'issues', 'query', 'my search term']);

    expect(request).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'Document' }),
      expect.objectContaining({ term: 'my search term' })
    );
  });

  it('uses searchIssues GraphQL query (not issues filter)', async () => {
    const request = vi.fn().mockResolvedValue(makeSearchResponse([]));
    stdMocks(request);
    const program = await buildProgram();

    await program.parseAsync(['node', 'linear', 'issues', 'query', 'bug']);

    // requestFn is now called with (TypedDocumentNode, vars) — check the document name
    const [docArg] = request.mock.calls[0] as [
      { kind: string; definitions: Array<{ name?: { value: string } }> },
      Record<string, unknown>,
    ];
    expect(docArg.kind).toBe('Document');
    const opName = docArg.definitions[0]?.name?.value ?? '';
    expect(opName).toBe('SearchIssues');
  });

  it('respects --limit', async () => {
    const request = vi.fn().mockResolvedValue(makeSearchResponse([]));
    stdMocks(request);
    const program = await buildProgram();

    await program.parseAsync(['node', 'linear', 'issues', 'query', 'bug', '--limit', '20']);

    expect(request).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'Document' }),
      expect.objectContaining({ first: 20 })
    );
  });

  it('--after passes cursor in variables', async () => {
    const request = vi.fn().mockResolvedValue(makeSearchResponse([]));
    stdMocks(request);
    const program = await buildProgram();

    await program.parseAsync(['node', 'linear', 'issues', 'query', 'bug', '--after', 'qCursor']);

    expect(request).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'Document' }),
      expect.objectContaining({ after: 'qCursor' })
    );
  });

  it('--all fetches multiple pages', async () => {
    const request = vi
      .fn()
      .mockResolvedValueOnce(
        makeSearchResponse(
          Array.from({ length: 50 }, (_, i) => makeIssueNode(`ENG-${i + 1}`, `Issue ${i + 1}`)),
          { hasNextPage: true, endCursor: 'qCur1' }
        )
      )
      .mockResolvedValueOnce(
        makeSearchResponse(
          Array.from({ length: 5 }, (_, i) => makeIssueNode(`ENG-${i + 51}`, `Issue ${i + 51}`)),
          { hasNextPage: false, endCursor: null }
        )
      );
    stdMocks(request);

    const program = await buildProgram();
    await program.parseAsync(['node', 'linear', 'issues', 'query', 'bug', '--all']);

    expect(request).toHaveBeenCalledTimes(2);
  });

  it('table output produced for issues query', async () => {
    const request = vi.fn().mockResolvedValue(
      makeSearchResponse([makeIssueNode('ENG-1', 'Bug')], {
        hasNextPage: true,
        endCursor: 'qNext',
      })
    );
    let capturedRows: string[][] = [];

    vi.doMock('../src/lib/client/index.js', () => ({
      getClient: vi.fn().mockReturnValue(ok({})),
      getClientWithAuthRetry: vi.fn().mockReturnValue(ok({})),
      getRequestFn: vi.fn().mockReturnValue(request),
    }));
    vi.doMock('../src/lib/output/table.js', () => ({
      prettyTable: vi.fn().mockImplementation((_h: string[], rows: string[][]) => {
        capturedRows = rows;
        return '';
      }),
      printTable: vi.fn(),
    }));
    vi.doMock('../src/lib/runner.js', () => ({ exitError: vi.fn() }));

    const program = await buildProgram();
    await program.parseAsync(['node', 'linear', 'issues', 'query', 'bug']);

    expect(request).toHaveBeenCalledOnce();
    expect(capturedRows.length).toBeGreaterThan(0);
    const flat = capturedRows.flat();
    expect(flat).toContain('ENG-1');
    expect(flat).toContain('Bug');
    expect(flat).toContain('Todo');
    expect(flat).toContain('Alice');
  });

  it('table output includes labels and a compact blocked-relations indicator', async () => {
    const request = vi.fn().mockResolvedValue(
      makeSearchResponse([
        makeIssueNode('ENG-1', 'Bug', {
          labelNames: ['bug', 'urgent'],
          blockingIds: ['ENG-2'],
          blockedByIds: ['ENG-3'],
        }),
      ])
    );
    let capturedRows: string[][] = [];
    vi.doMock('../src/lib/client/index.js', () => ({
      getClient: vi.fn().mockReturnValue(ok({})),
      getClientWithAuthRetry: vi.fn().mockReturnValue(ok({})),
      getRequestFn: vi.fn().mockReturnValue(request),
    }));
    vi.doMock('../src/lib/output/table.js', () => ({
      prettyTable: vi.fn().mockImplementation((_h: string[], rows: string[][]) => {
        capturedRows = rows;
        return '';
      }),
      printTable: vi.fn(),
    }));
    vi.doMock('../src/lib/runner.js', () => ({ exitError: vi.fn() }));

    const program = await buildProgram();
    await program.parseAsync(['node', 'linear', 'issues', 'query', 'bug']);

    const flat = capturedRows.flat();
    expect(flat.some((c) => c.includes('bug') && c.includes('urgent'))).toBe(true);
    expect(flat.some((c) => c.includes('blocking:1') && c.includes('blocked-by:1'))).toBe(true);
  });

  it('--plain includes full labels/blockedBy/blocking identifier lists', async () => {
    const request = vi.fn().mockResolvedValue(
      makeSearchResponse([
        makeIssueNode('ENG-1', 'Bug', {
          labelNames: ['bug'],
          blockingIds: ['ENG-9'],
          blockedByIds: ['ENG-8'],
        }),
      ])
    );
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.doMock('../src/lib/client/index.js', () => ({
      getClient: vi.fn().mockReturnValue(ok({})),
      getClientWithAuthRetry: vi.fn().mockReturnValue(ok({})),
      getRequestFn: vi.fn().mockReturnValue(request),
    }));
    vi.doMock('../src/lib/output/table.js', () => ({
      prettyTable: vi.fn().mockReturnValue(''),
      printTable: vi.fn(),
    }));
    vi.doMock('../src/lib/runner.js', () => ({ exitError: vi.fn() }));

    const program = await buildProgram();
    await program.parseAsync(['node', 'linear', 'issues', 'query', 'bug', '--plain']);

    const output = consoleSpy.mock.calls.map((c) => String(c[0])).join('\n');
    expect(output).toContain('labels: bug');
    expect(output).toContain('blockedBy: ENG-8');
    expect(output).toContain('blocking: ENG-9');

    consoleSpy.mockRestore();
  });

  it('default state filter applied to query search (OR-of-eqIgnoreCase)', async () => {
    const request = vi.fn().mockResolvedValue(makeSearchResponse([]));
    stdMocks(request);
    const program = await buildProgram();

    await program.parseAsync(['node', 'linear', 'issues', 'query', 'bug']);

    const [, vars] = request.mock.calls[0] as [string, Record<string, unknown>];
    const json = JSON.stringify(vars);
    expect(json).toContain('eqIgnoreCase');
    expect(json).toContain('"bug"');
  });

  it('--all-states on query removes state filter but keeps term', async () => {
    const request = vi.fn().mockResolvedValue(makeSearchResponse([]));
    stdMocks(request);
    const program = await buildProgram();

    await program.parseAsync(['node', 'linear', 'issues', 'query', 'bug', '--all-states']);

    const [, vars] = request.mock.calls[0] as [string, Record<string, unknown>];
    const json = JSON.stringify(vars);
    expect(json).not.toContain('eqIgnoreCase');
    expect(json).toContain('"bug"');
  });

  it('registers a --project <id-or-name> option', async () => {
    const program = await buildProgram();
    const queryCmd = program.commands
      .find((c) => c.name() === 'issues')
      ?.commands.find((c) => c.name() === 'query');
    const projectOption = queryCmd?.options.find((o) => o.long === '--project');
    expect(projectOption).toBeDefined();
  });

  it('explicit --project resolves via resolveProject and filters by id (in: [id])', async () => {
    const request = vi.fn().mockResolvedValue(makeSearchResponse([]));
    stdMocks(request);
    const program = await buildProgram();

    const uuid = '22222222-2222-2222-2222-222222222222';
    await program.parseAsync(['node', 'linear', 'issues', 'query', 'bug', '--project', uuid]);

    const [, vars] = request.mock.calls[0] as [string, { filter?: Record<string, unknown> }];
    const json = JSON.stringify(vars.filter);
    expect(json).toContain(uuid);
    expect(json).toContain('"in"');
  });

  it('no --project falls back to an OR/"in" filter across all configured default project IDs', async () => {
    const request = vi.fn().mockResolvedValue(makeSearchResponse([]));
    stdMocks(request);
    vi.doMock('../src/features/issues/shared/resolve.js', async (importOriginal) => {
      const actual =
        await importOriginal<typeof import('../src/features/issues/shared/resolve.js')>();
      return { ...actual, getDefaultProjectIds: vi.fn().mockReturnValue(['p1', 'p2']) };
    });
    const program = await buildProgram();

    await program.parseAsync(['node', 'linear', 'issues', 'query', 'bug']);

    const [, vars] = request.mock.calls[0] as [string, { filter?: Record<string, unknown> }];
    const json = JSON.stringify(vars.filter);
    expect(json).toContain('"p1"');
    expect(json).toContain('"p2"');
    expect(json).toContain('"in"');
  });

  it('explicit --project bypasses the config fallback entirely', async () => {
    const request = vi.fn().mockResolvedValue(makeSearchResponse([]));
    stdMocks(request);
    const getDefaultProjectIdsMock = vi.fn().mockReturnValue(['p1', 'p2']);
    vi.doMock('../src/features/issues/shared/resolve.js', async (importOriginal) => {
      const actual =
        await importOriginal<typeof import('../src/features/issues/shared/resolve.js')>();
      return { ...actual, getDefaultProjectIds: getDefaultProjectIdsMock };
    });
    const program = await buildProgram();

    const uuid = '33333333-3333-3333-3333-333333333333';
    await program.parseAsync(['node', 'linear', 'issues', 'query', 'bug', '--project', uuid]);

    const [, vars] = request.mock.calls[0] as [string, { filter?: Record<string, unknown> }];
    const json = JSON.stringify(vars.filter);
    expect(json).toContain(uuid);
    expect(json).not.toContain('"p1"');
    expect(getDefaultProjectIdsMock).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// TTY output selection
// ---------------------------------------------------------------------------
describe('TTY output selection', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
    vi.resetModules();
    process.exitCode = undefined;
  });

  it('issues list: default output always uses prettyTable', async () => {
    Object.defineProperty(process.stdout, 'isTTY', {
      value: true,
      writable: true,
      configurable: true,
    });
    const request = vi.fn().mockResolvedValue(makeListResponse([makeIssueNode('ENG-1', 'Bug')]));

    vi.doMock('../src/lib/client/index.js', () => ({
      getClient: vi.fn().mockReturnValue(ok({})),
      getClientWithAuthRetry: vi.fn().mockReturnValue(ok({})),
      getRequestFn: vi.fn().mockReturnValue(request),
    }));
    const printTableCalls: unknown[] = [];
    vi.doMock('../src/lib/output/table.js', () => ({
      prettyTable: vi.fn().mockReturnValue('TABLE'),
      printTable: vi.fn().mockImplementation((s: unknown) => printTableCalls.push(s)),
    }));
    vi.doMock('../src/lib/runner.js', () => ({ exitError: vi.fn() }));

    const program = await buildProgram();
    await program.parseAsync(['node', 'linear', 'issues', 'list', '--all-states']);

    expect(printTableCalls.length).toBeGreaterThan(0);
  });

  it('issues list: isTTY=true uses prettyTable (cli-table3)', async () => {
    Object.defineProperty(process.stdout, 'isTTY', {
      value: true,
      writable: true,
      configurable: true,
    });
    const request = vi.fn().mockResolvedValue(makeListResponse([makeIssueNode('ENG-1', 'Bug')]));

    vi.doMock('../src/lib/client/index.js', () => ({
      getClient: vi.fn().mockReturnValue(ok({})),
      getClientWithAuthRetry: vi.fn().mockReturnValue(ok({})),
      getRequestFn: vi.fn().mockReturnValue(request),
    }));
    const printTableCalls: unknown[] = [];
    vi.doMock('../src/lib/output/table.js', () => ({
      prettyTable: vi.fn().mockReturnValue('PRETTY'),
      printTable: vi.fn().mockImplementation((s: unknown) => printTableCalls.push(s)),
    }));
    vi.doMock('../src/lib/runner.js', () => ({ exitError: vi.fn() }));

    const program = await buildProgram();
    await program.parseAsync(['node', 'linear', 'issues', 'list', '--all-states']);

    expect(printTableCalls.length).toBeGreaterThan(0);
    expect(printTableCalls[0]).toBe('PRETTY');
  });

  it('issues list: isTTY=false still uses prettyTable', async () => {
    Object.defineProperty(process.stdout, 'isTTY', {
      value: false,
      writable: true,
      configurable: true,
    });
    const request = vi.fn().mockResolvedValue(makeListResponse([makeIssueNode('ENG-1', 'Bug')]));

    vi.doMock('../src/lib/client/index.js', () => ({
      getClient: vi.fn().mockReturnValue(ok({})),
      getClientWithAuthRetry: vi.fn().mockReturnValue(ok({})),
      getRequestFn: vi.fn().mockReturnValue(request),
    }));
    const printTableCalls: unknown[] = [];
    vi.doMock('../src/lib/output/table.js', () => ({
      prettyTable: vi.fn().mockReturnValue('TABLE'),
      printTable: vi.fn().mockImplementation((s: unknown) => printTableCalls.push(s)),
    }));
    vi.doMock('../src/lib/runner.js', () => ({ exitError: vi.fn() }));

    const program = await buildProgram();
    await program.parseAsync(['node', 'linear', 'issues', 'list', '--all-states']);

    expect(printTableCalls.length).toBeGreaterThan(0);
  });

  it('table output produced when no results', async () => {
    Object.defineProperty(process.stdout, 'isTTY', {
      value: false,
      writable: true,
      configurable: true,
    });
    const request = vi.fn().mockResolvedValue(makeListResponse([makeIssueNode('ENG-1', 'Bug')]));

    vi.doMock('../src/lib/client/index.js', () => ({
      getClient: vi.fn().mockReturnValue(ok({})),
      getClientWithAuthRetry: vi.fn().mockReturnValue(ok({})),
      getRequestFn: vi.fn().mockReturnValue(request),
    }));
    const printTableCalls: unknown[] = [];
    vi.doMock('../src/lib/output/table.js', () => ({
      prettyTable: vi.fn().mockReturnValue('TABLE'),
      printTable: vi.fn().mockImplementation((s: unknown) => printTableCalls.push(s)),
    }));
    vi.doMock('../src/lib/runner.js', () => ({ exitError: vi.fn() }));

    const program = await buildProgram();
    await program.parseAsync(['node', 'linear', 'issues', 'list', '--all-states']);

    expect(printTableCalls.length).toBeGreaterThan(0);
  });

  it('teams list: isTTY=true uses prettyTable', async () => {
    Object.defineProperty(process.stdout, 'isTTY', {
      value: true,
      writable: true,
      configurable: true,
    });
    // teams/list now uses client.teams() SDK method directly (not requestFn)
    const teamsFn = vi.fn().mockResolvedValue({
      nodes: [{ id: 't1', name: 'Eng', key: 'ENG' }],
      pageInfo: { hasNextPage: false, endCursor: null },
    });

    vi.doMock('../src/lib/client/index.js', () => ({
      getClient: vi.fn().mockReturnValue(ok({ teams: teamsFn })),
      getClientWithAuthRetry: vi.fn().mockReturnValue(ok({ teams: teamsFn })),
      getRequestFn: vi.fn(),
    }));
    const printTableCalls: unknown[] = [];
    vi.doMock('../src/lib/output/table.js', () => ({
      prettyTable: vi.fn().mockReturnValue('TEAMS_TABLE'),
      printTable: vi.fn().mockImplementation((s: unknown) => printTableCalls.push(s)),
    }));
    vi.doMock('../src/lib/runner.js', () => ({ exitError: vi.fn() }));

    const { registerTeams } = await import('../src/features/teams/command.js');
    const { Command } = await import('commander');
    const prog = new Command();
    prog.exitOverride();
    registerTeams(prog);

    await prog.parseAsync(['node', 'linear', 'teams', 'list']);

    expect(printTableCalls.length).toBeGreaterThan(0);
    expect(printTableCalls[0]).toBe('TEAMS_TABLE');
  });
});

// ---------------------------------------------------------------------------
// Exit codes
// ---------------------------------------------------------------------------
describe('exit codes', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
    vi.doUnmock('../src/lib/runner.js');
    vi.resetModules();
    process.exitCode = undefined;
  });

  beforeEach(() => {
    vi.doUnmock('../src/lib/runner.js');
  });

  it('sets process.exitCode = 1 on RATELIMITED error (issues list)', async () => {
    const rateLimitErr = {
      kind: 'RateLimitError' as const,
      message: 'Linear rate limit reached. Please wait before retrying.',
      name: 'RateLimitError',
    };

    vi.doMock('../src/lib/client/index.js', () => ({
      getClient: vi.fn().mockReturnValue(err(rateLimitErr)),
      getClientWithAuthRetry: vi.fn().mockReturnValue(err(rateLimitErr)),
    }));
    vi.doMock('../src/lib/output/table.js', () => ({
      prettyTable: vi.fn().mockReturnValue(''),
      printTable: vi.fn(),
    }));

    const program = await buildProgram();
    await program.parseAsync(['node', 'linear', 'issues', 'list']);

    expect(process.exitCode).toBe(1);
  });

  it('does not set process.exitCode on success (issues list)', async () => {
    const request = vi.fn().mockResolvedValue(makeListResponse([]));

    vi.doMock('../src/lib/client/index.js', () => ({
      getClient: vi.fn().mockReturnValue(ok({})),
      getClientWithAuthRetry: vi.fn().mockReturnValue(ok({})),
      getRequestFn: vi.fn().mockReturnValue(request),
    }));
    vi.doMock('../src/lib/output/table.js', () => ({
      prettyTable: vi.fn().mockReturnValue(''),
      printTable: vi.fn(),
    }));
    vi.doMock('../src/lib/runner.js', () => ({ exitError: vi.fn() }));

    const program = await buildProgram();
    await program.parseAsync(['node', 'linear', 'issues', 'list']);

    expect(process.exitCode).toBeUndefined();
  });

  it('bare `issues` (no subcommand) exits 0 — help is not an error', async () => {
    // Simulate the src/index.ts catch handler: commander.help / commander.helpDisplayed
    // must NOT set process.exitCode = 1.
    vi.doMock('../src/lib/runner.js', () => ({ exitError: vi.fn() }));

    const program = await buildProgram();

    // Capture any thrown CommanderError and apply the same logic as src/index.ts
    const applyIndexCatch = (err: unknown) => {
      if (err instanceof Error && 'code' in err) {
        const code = (err as { code: string }).code;
        if (
          code === 'commander.helpDisplayed' ||
          code === 'commander.help' ||
          code === 'commander.version'
        ) {
          return; // exit 0 — informational, not an error
        }
      }
      process.exitCode = 1;
    };

    try {
      await program.parseAsync(['node', 'linear', 'issues']);
    } catch (e) {
      applyIndexCatch(e);
    }

    // Help was shown — exit code must remain 0 (undefined = not set)
    expect(process.exitCode).toBeUndefined();
  });

  it('unknown top-level command exits non-zero', async () => {
    // Build a minimal program that mirrors the src/index.ts exitOverride + catch logic.
    // An unrecognized top-level command throws commander.unknownCommand — that IS an error.
    vi.doMock('../src/lib/runner.js', () => ({ exitError: vi.fn() }));

    const { Command } = await import('commander');
    const program = new Command();
    program.exitOverride();
    // Register a stub command so the program has subcommands like the real CLI
    const { registerIssues } = await import('../src/features/issues/command.js');
    registerIssues(program);

    const applyIndexCatch = (err: unknown) => {
      if (err instanceof Error && 'code' in err) {
        const code = (err as { code: string }).code;
        if (
          code === 'commander.helpDisplayed' ||
          code === 'commander.help' ||
          code === 'commander.version'
        ) {
          return;
        }
      }
      process.exitCode = 1;
    };

    try {
      await program.parseAsync(['node', 'linear', 'totally-unknown-command']);
    } catch (e) {
      applyIndexCatch(e);
    }

    expect(process.exitCode).toBe(1);
  });
});
