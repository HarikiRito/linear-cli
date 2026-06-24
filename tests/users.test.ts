import { ok } from 'neverthrow';
import { afterEach, describe, expect, it, vi } from 'vitest';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeUserNode(
  overrides: Partial<{
    id: string;
    name: string;
    displayName: string;
    email: string;
    active: boolean;
  }> = {}
) {
  return {
    id: 'user-uuid',
    name: 'Alice',
    displayName: 'Alice A.',
    email: 'alice@example.com',
    active: true,
    ...overrides,
  };
}

function makeUsersResponse(
  nodes: ReturnType<typeof makeUserNode>[],
  pageInfo = { hasNextPage: false, endCursor: null as string | null }
) {
  return { users: { nodes, pageInfo } };
}

function makeUserDetailResponse(overrides: Record<string, unknown> = {}) {
  return {
    user: {
      id: 'user-uuid',
      name: 'Alice',
      displayName: 'Alice A.',
      email: 'alice@example.com',
      active: true,
      url: 'https://linear.app/user/alice',
      avatarUrl: 'https://cdn.linear.app/avatar.png',
      ...overrides,
    },
  };
}

function stdMocks(requestFn: ReturnType<typeof vi.fn>) {
  vi.doMock('../src/lib/client/index.js', () => ({
    getClient: vi.fn().mockReturnValue(ok({})),
    getRequestFn: vi.fn().mockReturnValue(requestFn),
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
  const { registerUsers } = await import('../src/features/users/command.js');
  const { Command } = await import('commander');
  const program = new Command();
  program.exitOverride();
  registerUsers(program);
  return program;
}

// ---------------------------------------------------------------------------
// users list
// ---------------------------------------------------------------------------
describe('users list', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
    vi.resetModules();
    process.exitCode = undefined;
  });

  it('JSON has users array and pageInfo', async () => {
    const nodes = [
      makeUserNode(),
      makeUserNode({ id: 'user-2', name: 'Bob', displayName: 'Bob B.', email: 'bob@example.com' }),
    ];
    const requestFn = vi.fn().mockResolvedValue(makeUsersResponse(nodes));
    const printJsonCalls: unknown[] = [];

    stdMocks(requestFn);
    vi.doMock('../src/lib/output/json.js', () => ({
      printJson: vi.fn().mockImplementation((d: unknown) => printJsonCalls.push(d)),
    }));

    const program = await buildProgram();
    await program.parseAsync(['node', 'linear', 'users', 'list', '--json']);

    expect(requestFn).toHaveBeenCalledOnce();
    const out = printJsonCalls[0] as {
      users: { id: string; name: string; displayName: string; email: string; active: boolean }[];
      pageInfo: { hasNextPage: boolean };
    };
    expect(Array.isArray(out.users)).toBe(true);
    expect(out.users.length).toBe(2);
    expect(out.users[0]).toMatchObject({
      id: 'user-uuid',
      name: 'Alice',
      displayName: 'Alice A.',
      email: 'alice@example.com',
      active: true,
    });
    expect(out.pageInfo).toBeDefined();
    expect(typeof out.pageInfo.hasNextPage).toBe('boolean');
  });

  it('--limit passes first variable', async () => {
    const requestFn = vi.fn().mockResolvedValue(makeUsersResponse([]));
    stdMocks(requestFn);
    const program = await buildProgram();

    await program.parseAsync(['node', 'linear', 'users', 'list', '--limit', '3', '--json']);

    expect(requestFn).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'Document' }),
      expect.objectContaining({ first: 3 })
    );
  });

  it('--after passes cursor variable', async () => {
    const requestFn = vi.fn().mockResolvedValue(makeUsersResponse([]));
    stdMocks(requestFn);
    const program = await buildProgram();

    await program.parseAsync(['node', 'linear', 'users', 'list', '--after', 'cur1', '--json']);

    expect(requestFn).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'Document' }),
      expect.objectContaining({ after: 'cur1' })
    );
  });

  it('--all fetches multiple pages', async () => {
    const requestFn = vi
      .fn()
      .mockResolvedValueOnce(
        makeUsersResponse(
          Array.from({ length: 3 }, (_, i) =>
            makeUserNode({
              id: `u${i}`,
              name: `User ${i}`,
              displayName: `User ${i}`,
              email: `u${i}@example.com`,
            })
          ),
          { hasNextPage: true, endCursor: 'cur1' }
        )
      )
      .mockResolvedValueOnce(
        makeUsersResponse(
          [
            makeUserNode({
              id: 'u3',
              name: 'User 3',
              displayName: 'User 3',
              email: 'u3@example.com',
            }),
          ],
          { hasNextPage: false, endCursor: null }
        )
      );

    const printJsonCalls: unknown[] = [];
    vi.doMock('../src/lib/client/index.js', () => ({
      getClient: vi.fn().mockReturnValue(ok({})),
      getRequestFn: vi.fn().mockReturnValue(requestFn),
    }));
    vi.doMock('../src/lib/output/json.js', () => ({
      printJson: vi.fn().mockImplementation((d: unknown) => printJsonCalls.push(d)),
    }));
    vi.doMock('../src/lib/output/markdown.js', () => ({
      markdownTable: vi.fn().mockReturnValue(''),
      printMarkdown: vi.fn(),
    }));
    vi.doMock('../src/lib/output/table.js', () => ({
      prettyTable: vi.fn().mockReturnValue(''),
      printTable: vi.fn(),
    }));
    vi.doMock('../src/lib/runner.js', () => ({ exitError: vi.fn() }));

    const program = await buildProgram();
    await program.parseAsync(['node', 'linear', 'users', 'list', '--all', '--json']);

    expect(requestFn).toHaveBeenCalledTimes(2);
    const result = printJsonCalls[0] as { users: unknown[] };
    expect(result.users.length).toBe(4);
  });

  it('empty result exits 0 with empty array', async () => {
    const requestFn = vi.fn().mockResolvedValue(makeUsersResponse([]));
    const printJsonCalls: unknown[] = [];

    stdMocks(requestFn);
    vi.doMock('../src/lib/output/json.js', () => ({
      printJson: vi.fn().mockImplementation((d: unknown) => printJsonCalls.push(d)),
    }));

    const program = await buildProgram();
    await program.parseAsync(['node', 'linear', 'users', 'list', '--json']);

    const out = printJsonCalls[0] as { users: unknown[] };
    expect(out.users).toEqual([]);
    expect(process.exitCode).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// users get
// ---------------------------------------------------------------------------
describe('users get', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
    vi.resetModules();
    process.exitCode = undefined;
  });

  it('JSON has all user fields', async () => {
    const requestFn = vi.fn().mockResolvedValue(makeUserDetailResponse());
    const printJsonCalls: unknown[] = [];

    stdMocks(requestFn);
    vi.doMock('../src/lib/output/json.js', () => ({
      printJson: vi.fn().mockImplementation((d: unknown) => printJsonCalls.push(d)),
    }));

    const program = await buildProgram();
    await program.parseAsync(['node', 'linear', 'users', 'get', 'user-uuid', '--json']);

    const out = printJsonCalls[0] as { user: Record<string, unknown> };
    expect(out.user).toMatchObject({
      id: 'user-uuid',
      name: 'Alice',
      displayName: 'Alice A.',
      email: 'alice@example.com',
      active: true,
      url: expect.stringContaining('linear.app'),
    });
    expect('avatarUrl' in out.user).toBe(true);
  });

  it('unknown ID calls exitError', async () => {
    const requestFn = vi.fn().mockResolvedValue({ user: null });
    const exitErrorMock = vi.fn();

    stdMocks(requestFn);
    vi.doMock('../src/lib/runner.js', () => ({ exitError: exitErrorMock }));

    const program = await buildProgram();
    await program.parseAsync(['node', 'linear', 'users', 'get', 'bad-id', '--json']);

    expect(exitErrorMock).toHaveBeenCalled();
  });
});
