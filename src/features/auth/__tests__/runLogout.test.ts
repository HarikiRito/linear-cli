import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * runLogout() semantics (workspace-keyed):
 * - default: unlink cwd's linked workspace; delete its credential only when no
 *   other registry entry still references it
 * - --workspace <id>: delete that workspace's credential + unlink its entries
 * - --all: wipe the credentials store
 */

vi.mock('../../../lib/scope.js', () => ({
  findProjectRoot: vi.fn(),
}));

vi.mock('../../keepalive/registry.js', () => ({
  getEntry: vi.fn(),
  listProjects: vi.fn(),
  unregisterProject: vi.fn().mockResolvedValue({ isOk: () => true, isErr: () => false }),
}));

vi.mock('../credentials.js', () => ({
  deleteWorkspaceCredential: vi.fn().mockResolvedValue(true),
  writeCredentialsStore: vi.fn().mockResolvedValue(undefined),
}));

import { findProjectRoot } from '../../../lib/scope.js';
import {
  getEntry,
  listProjects,
  type RegisteredProject,
  unregisterProject,
} from '../../keepalive/registry.js';
import { deleteWorkspaceCredential, writeCredentialsStore } from '../credentials.js';
import { runLogout } from '../logout.js';

const mockFindProjectRoot = vi.mocked(findProjectRoot);
const mockGetEntry = vi.mocked(getEntry);
const mockListProjects = vi.mocked(listProjects);
const mockUnregisterProject = vi.mocked(unregisterProject);
const mockDeleteWorkspaceCredential = vi.mocked(deleteWorkspaceCredential);
const mockWriteCredentialsStore = vi.mocked(writeCredentialsStore);

function entries(
  ...projects: Array<{ root: string; workspace?: string }>
): ReturnType<typeof listProjects> {
  return {
    isOk: () => true,
    isErr: () => false,
    _unsafeUnwrap: () => projects as RegisteredProject[],
    unwrapOr: () => projects as RegisteredProject[],
  } as unknown as ReturnType<typeof listProjects>;
}

describe('runLogout', () => {
  let consoleLog: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    consoleLog = vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleLog.mockRestore();
  });

  it('--all wipes the credentials store', async () => {
    await runLogout({ all: true });
    expect(mockWriteCredentialsStore).toHaveBeenCalledWith({ workspaces: {} });
    expect(mockDeleteWorkspaceCredential).not.toHaveBeenCalled();
  });

  it('--workspace <id> deletes that credential and unlinks its registry entries', async () => {
    mockListProjects.mockReturnValue(
      entries(
        { root: '/a', workspace: 'ws-1' },
        { root: '/b', workspace: 'ws-1' },
        { root: '/c', workspace: 'ws-2' }
      )
    );

    await runLogout({ workspace: 'ws-1' });

    expect(mockDeleteWorkspaceCredential).toHaveBeenCalledWith('ws-1');
    expect(mockUnregisterProject).toHaveBeenCalledTimes(2);
    expect(mockUnregisterProject).toHaveBeenCalledWith('/a');
    expect(mockUnregisterProject).toHaveBeenCalledWith('/b');
  });

  it('default: unlinks cwd and deletes the credential when it becomes orphaned', async () => {
    mockFindProjectRoot.mockReturnValue('/repo');
    mockGetEntry.mockReturnValue({ root: '/repo', workspace: 'ws-1' } as RegisteredProject);
    mockListProjects.mockReturnValue(entries()); // nothing else references ws-1

    await runLogout();

    expect(mockUnregisterProject).toHaveBeenCalledWith('/repo');
    expect(mockDeleteWorkspaceCredential).toHaveBeenCalledWith('ws-1');
  });

  it('default: keeps the credential when another linked dir still uses it', async () => {
    mockFindProjectRoot.mockReturnValue('/repo');
    mockGetEntry.mockReturnValue({ root: '/repo', workspace: 'ws-1' } as RegisteredProject);
    mockListProjects.mockReturnValue(entries({ root: '/other', workspace: 'ws-1' }));

    await runLogout();

    expect(mockUnregisterProject).toHaveBeenCalledWith('/repo');
    expect(mockDeleteWorkspaceCredential).not.toHaveBeenCalled();
  });

  it('default: no-op when cwd is not linked', async () => {
    mockFindProjectRoot.mockReturnValue(null);

    await runLogout();

    expect(mockUnregisterProject).not.toHaveBeenCalled();
    expect(mockDeleteWorkspaceCredential).not.toHaveBeenCalled();
  });
});
