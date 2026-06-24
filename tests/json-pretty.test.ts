/**
 * Tests for the --json compact and --json --pretty output modes.
 *
 * Covers:
 * - printJson unit tests (compact default, pretty mode, arrays, round-trip, edge cases)
 * - CLI integration tests for a list command (issues list) and a single-item command (issues get)
 *   with the combinations: default (table), --json, --json --pretty, --pretty alone (no-op)
 */

import { ok } from 'neverthrow';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// ---------------------------------------------------------------------------
// Unit tests for printJson
// ---------------------------------------------------------------------------
describe('printJson', () => {
  let consoleSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleSpy.mockRestore();
    vi.resetModules();
  });

  it('compact default — single object with no spaces', async () => {
    const { printJson } = await import('../src/lib/output/json.js');
    printJson({ id: '1', title: 'foo' });
    expect(consoleSpy).toHaveBeenCalledWith('{"id":"1","title":"foo"}');
  });

  it('pretty mode — 2-space indented output', async () => {
    const { printJson } = await import('../src/lib/output/json.js');
    const data = { id: '1', title: 'foo' };
    printJson(data, true);
    expect(consoleSpy).toHaveBeenCalledWith(JSON.stringify(data, null, 2));
  });

  it('compact array — single line no spaces', async () => {
    const { printJson } = await import('../src/lib/output/json.js');
    printJson([{ id: '1' }, { id: '2' }]);
    expect(consoleSpy).toHaveBeenCalledWith('[{"id":"1"},{"id":"2"}]');
  });

  it('round-trip integrity — compact output parses back to original', async () => {
    const { printJson } = await import('../src/lib/output/json.js');
    const data = { a: [1, 2, null], b: { nested: true } };
    printJson(data);
    const output = consoleSpy.mock.calls[0]?.[0] as string;
    expect(JSON.parse(output)).toEqual(data);
  });

  it('compact with null field — undefined omitted, null preserved', async () => {
    const { printJson } = await import('../src/lib/output/json.js');
    printJson({ a: null, b: undefined });
    expect(consoleSpy).toHaveBeenCalledWith('{"a":null}');
  });

  it('empty array — outputs []', async () => {
    const { printJson } = await import('../src/lib/output/json.js');
    printJson([]);
    expect(consoleSpy).toHaveBeenCalledWith('[]');
  });

  it('compact output has no internal newlines', async () => {
    const { printJson } = await import('../src/lib/output/json.js');
    printJson({ key: 'value', nested: { deep: [1, 2, 3] } });
    const output = consoleSpy.mock.calls[0]?.[0] as string;
    expect(output).not.toContain('\n');
  });

  it('pretty output has newlines (multi-line)', async () => {
    const { printJson } = await import('../src/lib/output/json.js');
    printJson({ key: 'value', nested: { deep: true } }, true);
    const output = consoleSpy.mock.calls[0]?.[0] as string;
    expect(output).toContain('\n');
    expect(output).toContain('  ');
  });

  it('compact is shorter than pretty for multi-field object', async () => {
    const { printJson } = await import('../src/lib/output/json.js');
    const data = { id: '1', title: 'foo', state: 'In Progress', assignee: 'Alice' };

    printJson(data);
    const compact = consoleSpy.mock.calls[0]?.[0] as string;

    consoleSpy.mockClear();

    printJson(data, true);
    const pretty = consoleSpy.mock.calls[0]?.[0] as string;

    expect(compact.length).toBeLessThan(pretty.length);
  });
});

// ---------------------------------------------------------------------------
// Helper factories for CLI integration tests
// ---------------------------------------------------------------------------

function makeIssueNode(id: string, title: string) {
  return {
    identifier: id,
    title,
    state: { name: 'Todo' },
    assignee: { displayName: 'Alice' },
  };
}

function makeListResponse(
  nodes: ReturnType<typeof makeIssueNode>[],
  pageInfo = { hasNextPage: false, endCursor: null as string | null }
) {
  return { issues: { nodes, pageInfo } };
}

function makeIssueDetailResponse() {
  return {
    issue: {
      id: 'issue-uuid',
      identifier: 'ENG-1',
      title: 'Test',
      description: null,
      url: 'https://linear.app/test/ENG-1',
      branchName: 'eng-1-test',
      priority: 2,
      estimate: null,
      dueDate: null,
      createdAt: '2026-01-01T00:00:00.000Z',
      state: { id: 'state-uuid', name: 'Todo', type: 'unstarted' },
      assignee: null,
      labels: { nodes: [] },
      project: null,
      parent: null,
      children: { nodes: [] },
      attachments: { nodes: [] },
    },
  };
}

function mockModules(requestFn: ReturnType<typeof vi.fn>) {
  vi.doMock('../src/lib/client/index.js', () => ({
    getClient: vi.fn().mockReturnValue(ok({})),
    getRequestFn: vi.fn().mockReturnValue(requestFn),
  }));
  vi.doMock('../src/lib/runner.js', () => ({ exitError: vi.fn() }));
}

function mockAllOutputs(requestFn: ReturnType<typeof vi.fn>) {
  mockModules(requestFn);
  vi.doMock('../src/lib/output/json.js', () => ({ printJson: vi.fn() }));
  vi.doMock('../src/lib/output/markdown.js', () => ({
    markdownTable: vi.fn().mockReturnValue('MD'),
    printMarkdown: vi.fn(),
  }));
  vi.doMock('../src/lib/output/table.js', () => ({
    prettyTable: vi.fn().mockReturnValue('TABLE'),
    printTable: vi.fn(),
  }));
}

async function buildIssuesProgram() {
  const { registerIssues } = await import('../src/features/issues/command.js');
  const { Command } = await import('commander');
  const program = new Command();
  program.exitOverride();
  registerIssues(program);
  return program;
}

// ---------------------------------------------------------------------------
// CLI integration: list command
// ---------------------------------------------------------------------------
describe('issues list — JSON output modes', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
    vi.resetModules();
    process.exitCode = undefined;
  });

  it('--json (no --pretty) calls printJson with pretty=false', async () => {
    const request = vi.fn().mockResolvedValue(makeListResponse([makeIssueNode('ENG-1', 'Bug')]));
    mockModules(request);

    const printJsonCalls: Array<[unknown, boolean | undefined]> = [];
    vi.doMock('../src/lib/output/json.js', () => ({
      printJson: vi.fn().mockImplementation((d: unknown, p?: boolean) => {
        printJsonCalls.push([d, p]);
      }),
    }));
    vi.doMock('../src/lib/output/markdown.js', () => ({
      markdownTable: vi.fn().mockReturnValue(''),
      printMarkdown: vi.fn(),
    }));
    vi.doMock('../src/lib/output/table.js', () => ({
      prettyTable: vi.fn().mockReturnValue(''),
      printTable: vi.fn(),
    }));

    const program = await buildIssuesProgram();
    await program.parseAsync(['node', 'linear', 'issues', 'list', '--json', '--all-states']);

    expect(printJsonCalls.length).toBeGreaterThan(0);
    // pretty must be explicitly false
    expect(printJsonCalls[0]?.[1]).toBe(false);
  });

  it('--json --pretty calls printJson with pretty=true', async () => {
    const request = vi.fn().mockResolvedValue(makeListResponse([makeIssueNode('ENG-1', 'Bug')]));
    mockModules(request);

    const printJsonCalls: Array<[unknown, boolean | undefined]> = [];
    vi.doMock('../src/lib/output/json.js', () => ({
      printJson: vi.fn().mockImplementation((d: unknown, p?: boolean) => {
        printJsonCalls.push([d, p]);
      }),
    }));
    vi.doMock('../src/lib/output/markdown.js', () => ({
      markdownTable: vi.fn().mockReturnValue(''),
      printMarkdown: vi.fn(),
    }));
    vi.doMock('../src/lib/output/table.js', () => ({
      prettyTable: vi.fn().mockReturnValue(''),
      printTable: vi.fn(),
    }));

    const program = await buildIssuesProgram();
    await program.parseAsync([
      'node',
      'linear',
      'issues',
      'list',
      '--json',
      '--pretty',
      '--all-states',
    ]);

    expect(printJsonCalls.length).toBeGreaterThan(0);
    expect(printJsonCalls[0]?.[1]).toBe(true);
  });

  it('--pretty alone (no --json) falls through to table/markdown — printJson NOT called', async () => {
    Object.defineProperty(process.stdout, 'isTTY', {
      value: false,
      writable: true,
      configurable: true,
    });
    const request = vi.fn().mockResolvedValue(makeListResponse([makeIssueNode('ENG-1', 'Bug')]));
    const printJsonMock = vi.fn();
    const printMarkdownCalls: unknown[] = [];

    mockModules(request);
    vi.doMock('../src/lib/output/json.js', () => ({ printJson: printJsonMock }));
    vi.doMock('../src/lib/output/markdown.js', () => ({
      markdownTable: vi.fn().mockReturnValue('MD'),
      printMarkdown: vi.fn().mockImplementation((s: unknown) => printMarkdownCalls.push(s)),
    }));
    vi.doMock('../src/lib/output/table.js', () => ({
      prettyTable: vi.fn().mockReturnValue(''),
      printTable: vi.fn(),
    }));

    const program = await buildIssuesProgram();
    await program.parseAsync(['node', 'linear', 'issues', 'list', '--pretty', '--all-states']);

    expect(printJsonMock).not.toHaveBeenCalled();
    expect(printMarkdownCalls.length).toBeGreaterThan(0);
  });

  it('default (no flags) in non-TTY produces markdown table', async () => {
    Object.defineProperty(process.stdout, 'isTTY', {
      value: false,
      writable: true,
      configurable: true,
    });
    const request = vi.fn().mockResolvedValue(makeListResponse([makeIssueNode('ENG-1', 'Bug')]));
    const printJsonMock = vi.fn();
    const printMarkdownCalls: unknown[] = [];

    mockModules(request);
    vi.doMock('../src/lib/output/json.js', () => ({ printJson: printJsonMock }));
    vi.doMock('../src/lib/output/markdown.js', () => ({
      markdownTable: vi.fn().mockReturnValue('MD'),
      printMarkdown: vi.fn().mockImplementation((s: unknown) => printMarkdownCalls.push(s)),
    }));
    vi.doMock('../src/lib/output/table.js', () => ({
      prettyTable: vi.fn().mockReturnValue(''),
      printTable: vi.fn(),
    }));

    const program = await buildIssuesProgram();
    await program.parseAsync(['node', 'linear', 'issues', 'list', '--all-states']);

    expect(printJsonMock).not.toHaveBeenCalled();
    expect(printMarkdownCalls.length).toBeGreaterThan(0);
    expect(printMarkdownCalls[0]).toBe('MD');
  });

  it('default (no flags) in TTY produces prettyTable', async () => {
    Object.defineProperty(process.stdout, 'isTTY', {
      value: true,
      writable: true,
      configurable: true,
    });
    const request = vi.fn().mockResolvedValue(makeListResponse([makeIssueNode('ENG-1', 'Bug')]));
    const printJsonMock = vi.fn();
    const printTableCalls: unknown[] = [];

    mockModules(request);
    vi.doMock('../src/lib/output/json.js', () => ({ printJson: printJsonMock }));
    vi.doMock('../src/lib/output/markdown.js', () => ({
      markdownTable: vi.fn().mockReturnValue(''),
      printMarkdown: vi.fn(),
    }));
    vi.doMock('../src/lib/output/table.js', () => ({
      prettyTable: vi.fn().mockReturnValue('TABLE'),
      printTable: vi.fn().mockImplementation((s: unknown) => printTableCalls.push(s)),
    }));

    const program = await buildIssuesProgram();
    await program.parseAsync(['node', 'linear', 'issues', 'list', '--all-states']);

    expect(printJsonMock).not.toHaveBeenCalled();
    expect(printTableCalls.length).toBeGreaterThan(0);
    expect(printTableCalls[0]).toBe('TABLE');
  });
});

// ---------------------------------------------------------------------------
// CLI integration: single-item command (issues get)
// ---------------------------------------------------------------------------
describe('issues get — JSON output modes', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
    vi.resetModules();
    process.exitCode = undefined;
  });

  it('--json (no --pretty) calls printJson with pretty=false', async () => {
    const request = vi.fn().mockResolvedValue(makeIssueDetailResponse());
    mockModules(request);

    const printJsonCalls: Array<[unknown, boolean | undefined]> = [];
    vi.doMock('../src/lib/output/json.js', () => ({
      printJson: vi.fn().mockImplementation((d: unknown, p?: boolean) => {
        printJsonCalls.push([d, p]);
      }),
    }));
    vi.doMock('../src/lib/output/markdown.js', () => ({
      markdownTable: vi.fn().mockReturnValue(''),
      printMarkdown: vi.fn(),
    }));
    vi.doMock('../src/lib/output/table.js', () => ({
      prettyTable: vi.fn().mockReturnValue(''),
      printTable: vi.fn(),
    }));

    const program = await buildIssuesProgram();
    await program.parseAsync(['node', 'linear', 'issues', 'get', 'ENG-1', '--json']);

    expect(printJsonCalls.length).toBeGreaterThan(0);
    expect(printJsonCalls[0]?.[1]).toBe(false);
  });

  it('--json --pretty calls printJson with pretty=true', async () => {
    const request = vi.fn().mockResolvedValue(makeIssueDetailResponse());
    mockModules(request);

    const printJsonCalls: Array<[unknown, boolean | undefined]> = [];
    vi.doMock('../src/lib/output/json.js', () => ({
      printJson: vi.fn().mockImplementation((d: unknown, p?: boolean) => {
        printJsonCalls.push([d, p]);
      }),
    }));
    vi.doMock('../src/lib/output/markdown.js', () => ({
      markdownTable: vi.fn().mockReturnValue(''),
      printMarkdown: vi.fn(),
    }));
    vi.doMock('../src/lib/output/table.js', () => ({
      prettyTable: vi.fn().mockReturnValue(''),
      printTable: vi.fn(),
    }));

    const program = await buildIssuesProgram();
    await program.parseAsync(['node', 'linear', 'issues', 'get', 'ENG-1', '--json', '--pretty']);

    expect(printJsonCalls.length).toBeGreaterThan(0);
    expect(printJsonCalls[0]?.[1]).toBe(true);
  });

  it('--pretty alone (no --json) uses table/markdown — printJson NOT called', async () => {
    Object.defineProperty(process.stdout, 'isTTY', {
      value: false,
      writable: true,
      configurable: true,
    });
    const request = vi.fn().mockResolvedValue(makeIssueDetailResponse());
    const printJsonMock = vi.fn();
    const printMarkdownCalls: unknown[] = [];

    mockModules(request);
    vi.doMock('../src/lib/output/json.js', () => ({ printJson: printJsonMock }));
    vi.doMock('../src/lib/output/markdown.js', () => ({
      markdownTable: vi.fn().mockReturnValue('MD'),
      printMarkdown: vi.fn().mockImplementation((s: unknown) => printMarkdownCalls.push(s)),
    }));
    vi.doMock('../src/lib/output/table.js', () => ({
      prettyTable: vi.fn().mockReturnValue(''),
      printTable: vi.fn(),
    }));

    const program = await buildIssuesProgram();
    await program.parseAsync(['node', 'linear', 'issues', 'get', 'ENG-1', '--pretty']);

    expect(printJsonMock).not.toHaveBeenCalled();
    expect(printMarkdownCalls.length).toBeGreaterThan(0);
  });

  it('default (no flags) non-TTY uses markdown', async () => {
    Object.defineProperty(process.stdout, 'isTTY', {
      value: false,
      writable: true,
      configurable: true,
    });
    const request = vi.fn().mockResolvedValue(makeIssueDetailResponse());
    const printJsonMock = vi.fn();
    const printMarkdownCalls: unknown[] = [];

    mockModules(request);
    vi.doMock('../src/lib/output/json.js', () => ({ printJson: printJsonMock }));
    vi.doMock('../src/lib/output/markdown.js', () => ({
      markdownTable: vi.fn().mockReturnValue('MD'),
      printMarkdown: vi.fn().mockImplementation((s: unknown) => printMarkdownCalls.push(s)),
    }));
    vi.doMock('../src/lib/output/table.js', () => ({
      prettyTable: vi.fn().mockReturnValue(''),
      printTable: vi.fn(),
    }));

    const program = await buildIssuesProgram();
    await program.parseAsync(['node', 'linear', 'issues', 'get', 'ENG-1']);

    expect(printJsonMock).not.toHaveBeenCalled();
    expect(printMarkdownCalls.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// Verify --pretty appears in --help output for issues list
// ---------------------------------------------------------------------------
describe('--help text', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
    vi.resetModules();
    process.exitCode = undefined;
  });

  it('issues list --help mentions --pretty with JSON scope text', async () => {
    const { registerIssues } = await import('../src/features/issues/command.js');
    const { Command } = await import('commander');
    const program = new Command();
    program.exitOverride();
    registerIssues(program);

    let helpText = '';
    try {
      await program.parseAsync(['node', 'linear', 'issues', 'list', '--help']);
    } catch {
      // exitOverride throws on --help
    }

    // Capture help via writeOut override
    const helpCmd = program.commands
      .find((c) => c.name() === 'issues')
      ?.commands.find((c) => c.name() === 'list');

    if (helpCmd) {
      helpText = helpCmd.helpInformation();
    }

    expect(helpText).toContain('--pretty');
    expect(helpText.toLowerCase()).toContain('json');
  });
});
