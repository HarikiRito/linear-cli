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
    getClientWithAuthRetry: vi.fn().mockReturnValue(ok({})),
    getRequestFn: vi.fn().mockReturnValue(requestFn),
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


  it('--limit passes first variable', async () => {
    const requestFn = vi.fn().mockResolvedValue(makeUsersResponse([]));
    stdMocks(requestFn);
    const program = await buildProgram();

    await program.parseAsync(['node', 'linear', 'users', 'list', '--limit', '3']);

    expect(requestFn).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'Document' }),
      expect.objectContaining({ first: 3 })
    );
  });

  it('--after passes cursor variable', async () => {
    const requestFn = vi.fn().mockResolvedValue(makeUsersResponse([]));
    stdMocks(requestFn);
    const program = await buildProgram();

    await program.parseAsync(['node', 'linear', 'users', 'list', '--after', 'cur1']);

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

    vi.doMock('../src/lib/client/index.js', () => ({
      getClient: vi.fn().mockReturnValue(ok({})),
      getClientWithAuthRetry: vi.fn().mockReturnValue(ok({})),
      getRequestFn: vi.fn().mockReturnValue(requestFn),
    }));
    vi.doMock('../src/lib/output/table.js', () => ({
      prettyTable: vi.fn().mockReturnValue(''),
      printTable: vi.fn(),
    }));
    vi.doMock('../src/lib/runner.js', () => ({ exitError: vi.fn() }));

    const program = await buildProgram();
    await program.parseAsync(['node', 'linear', 'users', 'list', '--all']);

    expect(requestFn).toHaveBeenCalledTimes(2);
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


  it('unknown ID calls exitError', async () => {
    const requestFn = vi.fn().mockResolvedValue({ user: null });
    const exitErrorMock = vi.fn();

    stdMocks(requestFn);
    vi.doMock('../src/lib/runner.js', () => ({ exitError: exitErrorMock }));

    const program = await buildProgram();
    await program.parseAsync(['node', 'linear', 'users', 'get', 'bad-id']);

    expect(exitErrorMock).toHaveBeenCalled();
  });
});
