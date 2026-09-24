import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../auth/credentials.js', () => ({
  listWorkspaceCredentials: vi.fn(),
}));

vi.mock('../status.js', () => ({
  resolveWorkspaceStatus: vi.fn(),
}));

import { listWorkspaceCredentials } from '../../auth/credentials.js';
import { runWorkspaceList } from '../list.js';
import { resolveWorkspaceStatus } from '../status.js';

const mockListWorkspaceCredentials = vi.mocked(listWorkspaceCredentials);
const mockResolveWorkspaceStatus = vi.mocked(resolveWorkspaceStatus);

describe('runWorkspaceList', () => {
  let log: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    log = vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('prints one plain record per stored workspace', async () => {
    mockListWorkspaceCredentials.mockResolvedValue({
      'ws-1': { apiKey: 'a' },
      'ws-2': { accessToken: 'b', refreshToken: 'rt', expiresAt: 0 },
    });
    mockResolveWorkspaceStatus.mockImplementation((id) =>
      Promise.resolve(
        id === 'ws-1'
          ? { id: 'ws-1', name: 'Acme', urlKey: 'acme', state: 'valid' }
          : { id: 'ws-2', name: 'ws-2', urlKey: '', state: 'invalid' }
      )
    );

    await runWorkspaceList({ plain: true });

    const output = log.mock.calls.map((c) => c[0]).join('\n');
    expect(output).toContain('Workspace: ws-1');
    expect(output).toContain('name: Acme');
    expect(output).toContain('state: valid');
    expect(output).toContain('Workspace: ws-2');
    expect(output).toContain('state: invalid');
  });

  it('prints a table by default (non-plain)', async () => {
    mockListWorkspaceCredentials.mockResolvedValue({ 'ws-1': { apiKey: 'a' } });
    mockResolveWorkspaceStatus.mockResolvedValue({
      id: 'ws-1',
      name: 'Acme',
      urlKey: 'acme',
      state: 'valid',
    });

    await runWorkspaceList({ plain: false });

    const output = log.mock.calls.map((c) => c[0]).join('\n');
    expect(output).toContain('Acme');
    expect(output).toContain('valid');
  });

  it('does not blow up when there are no stored workspaces', async () => {
    mockListWorkspaceCredentials.mockResolvedValue({});

    await runWorkspaceList({ plain: false });

    expect(log).toHaveBeenCalledWith(expect.stringContaining('No stored workspaces'));
  });
});
