import { ok } from 'neverthrow';
import { afterEach, describe, expect, it, vi } from 'vitest';

/** readFileSync must report "no config file" so resolveIssueIdentifier's project-scope read is a no-op (see attachments.test.ts). */
function enoentReadFileSync(): never {
  throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
}

function mockNoConfigFs(): void {
  vi.doMock('node:fs', () => {
    const mod = { readFileSync: enoentReadFileSync };
    return { ...mod, default: mod };
  });
}

function makeRelationsResponse() {
  return {
    issue: {
      id: 'issue-uuid',
      identifier: 'ENG-1',
      parent: { id: 'parent-uuid', identifier: 'ENG-0', title: 'Parent Issue' },
      children: {
        nodes: [{ id: 'child-uuid', identifier: 'ENG-2', title: 'Child Issue' }],
      },
      relations: {
        nodes: [
          {
            id: 'rel-uuid-1',
            type: 'blocks',
            relatedIssue: { id: 'other-uuid', identifier: 'ENG-3', title: 'Blocked Issue' },
          },
        ],
      },
      inverseRelations: {
        nodes: [
          {
            id: 'rel-uuid-2',
            type: 'related',
            issue: { id: 'inverse-uuid', identifier: 'ENG-4', title: 'Related Issue' },
          },
        ],
      },
    },
  };
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.clearAllMocks();
  vi.resetModules();
  process.exitCode = undefined;
});

describe('listRelations', () => {
  it('renders rows for all relations including parent, children, relations, inverseRelations', async () => {
    const requestFn = vi.fn().mockResolvedValue(makeRelationsResponse());
    const capturedRows: string[][] = [];

    vi.doMock('../../../lib/client/index.js', () => ({
      getClientWithAuthRetry: vi.fn().mockReturnValue(ok({})),
      getRequestFn: vi.fn().mockReturnValue(requestFn),
    }));
    vi.doMock('../../../lib/output/table.js', () => ({
      prettyTable: vi.fn().mockImplementation((_h: string[], rows: string[][]) => {
        capturedRows.push(...rows);
        return '';
      }),
      printTable: vi.fn(),
    }));
    mockNoConfigFs();
    vi.doMock('../../../lib/runner.js', () => ({ exitError: vi.fn() }));

    const { listRelations } = await import('../relations/relations.js');
    await listRelations({ id: 'ENG-1', plain: false });

    expect(requestFn).toHaveBeenCalled();
    const flat = capturedRows.flat();
    // parent row
    expect(flat).toContain('ENG-0');
    // child row
    expect(flat).toContain('ENG-2');
    // relation row
    expect(flat).toContain('rel-uuid-1');
    expect(flat).toContain('ENG-3');
    // inverse relation row
    expect(flat).toContain('rel-uuid-2');
    expect(flat).toContain('ENG-4');
  });

  it("direction describes the queried issue's own role, not the listed issue's", async () => {
    const requestFn = vi.fn().mockResolvedValue(makeRelationsResponse());
    const capturedRows: string[][] = [];

    vi.doMock('../../../lib/client/index.js', () => ({
      getClientWithAuthRetry: vi.fn().mockReturnValue(ok({})),
      getRequestFn: vi.fn().mockReturnValue(requestFn),
    }));
    vi.doMock('../../../lib/output/table.js', () => ({
      prettyTable: vi.fn().mockImplementation((_h: string[], rows: string[][]) => {
        capturedRows.push(...rows);
        return '';
      }),
      printTable: vi.fn(),
    }));
    mockNoConfigFs();
    vi.doMock('../../../lib/runner.js', () => ({ exitError: vi.fn() }));

    const { listRelations } = await import('../relations/relations.js');
    await listRelations({ id: 'ENG-1', plain: false });

    // queried issue (ENG-1) has parent ENG-0 -> ENG-1 is the sub-issue
    expect(capturedRows).toContainEqual([
      '(parent)',
      'parent',
      'sub-issue-of',
      'ENG-0',
      'Parent Issue',
    ]);
    // queried issue (ENG-1) has child ENG-2 -> ENG-1 is the parent
    expect(capturedRows).toContainEqual(['(child)', 'parent', 'parent-of', 'ENG-2', 'Child Issue']);
  });

  it('--plain mode calls console.log with plain output', async () => {
    const requestFn = vi.fn().mockResolvedValue(makeRelationsResponse());
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    vi.doMock('../../../lib/client/index.js', () => ({
      getClientWithAuthRetry: vi.fn().mockReturnValue(ok({})),
      getRequestFn: vi.fn().mockReturnValue(requestFn),
    }));
    vi.doMock('../../../lib/output/table.js', () => ({
      prettyTable: vi.fn().mockReturnValue(''),
      printTable: vi.fn(),
    }));
    mockNoConfigFs();
    vi.doMock('../../../lib/runner.js', () => ({ exitError: vi.fn() }));

    const { listRelations } = await import('../relations/relations.js');
    await listRelations({ id: 'ENG-1', plain: true });

    const output = consoleSpy.mock.calls.map((c) => String(c[0])).join('\n');
    expect(output).toContain('Relation:');
    consoleSpy.mockRestore();
  });

  it('empty issue relations shows empty state message', async () => {
    const requestFn = vi.fn().mockResolvedValue({
      issue: {
        id: 'issue-uuid',
        identifier: 'ENG-1',
        parent: null,
        children: { nodes: [] },
        relations: { nodes: [] },
        inverseRelations: { nodes: [] },
      },
    });
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    vi.doMock('../../../lib/client/index.js', () => ({
      getClientWithAuthRetry: vi.fn().mockReturnValue(ok({})),
      getRequestFn: vi.fn().mockReturnValue(requestFn),
    }));
    vi.doMock('../../../lib/output/table.js', () => ({
      prettyTable: vi.fn().mockReturnValue(''),
      printTable: vi.fn(),
    }));
    mockNoConfigFs();
    vi.doMock('../../../lib/runner.js', () => ({ exitError: vi.fn() }));

    const { listRelations } = await import('../relations/relations.js');
    await listRelations({ id: 'ENG-1', plain: false });

    const output = consoleSpy.mock.calls.map((c) => String(c[0])).join('\n');
    expect(output).toContain('No relations');
    consoleSpy.mockRestore();
  });
});
