import { err, ok } from 'neverthrow';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// All mocks must be registered before the module under test is imported.
vi.mock('@clack/prompts', () => ({
  intro: vi.fn(),
  outro: vi.fn(),
}));

vi.mock('@linear/sdk', () => ({
  LinearClient: vi.fn().mockImplementation((opts: Record<string, unknown>) => ({
    __opts: opts,
  })),
}));

vi.mock('../../../lib/scope.js', () => ({
  findProjectRoot: vi.fn(),
}));

vi.mock('../../keepalive/registry.js', () => ({
  getEntry: vi.fn(),
}));

vi.mock('../resolve.js', () => ({
  resolveCredential: vi.fn(),
}));

vi.mock('../login.js', () => ({
  runLoginFlow: vi.fn(),
}));

vi.mock('../team-select.js', () => ({
  selectAndPersistTeamAndProjects: vi.fn(),
}));

import { findProjectRoot } from '../../../lib/scope.js';
import { getEntry, type RegisteredProject } from '../../keepalive/registry.js';
import { runLoginFlow } from '../login.js';
import { resolveCredential } from '../resolve.js';
import { selectAndPersistTeamAndProjects } from '../team-select.js';
import { runTeamSelectFlow } from '../team-select-command.js';

const mockFindProjectRoot = vi.mocked(findProjectRoot);
const mockGetEntry = vi.mocked(getEntry);
const mockResolveCredential = vi.mocked(resolveCredential);
const mockRunLoginFlow = vi.mocked(runLoginFlow);
const mockSelectAndPersist = vi.mocked(selectAndPersistTeamAndProjects);

describe('runTeamSelectFlow', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('writes team to the registry entry when cwd is linked to a workspace', async () => {
    mockFindProjectRoot.mockReturnValue('/repo');
    mockGetEntry.mockReturnValue({ root: '/repo', workspace: 'ws-1' } as RegisteredProject);
    mockResolveCredential.mockReturnValue(
      ok({ type: 'apiKey', value: 'lin_api_key' }) as unknown as ReturnType<
        typeof resolveCredential
      >
    );

    await runTeamSelectFlow();

    expect(mockResolveCredential).toHaveBeenCalledWith({ allowInteractive: false });
    expect(mockSelectAndPersist).toHaveBeenCalledOnce();
    expect(mockSelectAndPersist).toHaveBeenCalledWith(expect.anything(), {
      type: 'registry',
      root: '/repo',
    });
    expect(mockRunLoginFlow).not.toHaveBeenCalled();
  });

  it('writes team to the global config when cwd is not linked', async () => {
    mockFindProjectRoot.mockReturnValue(null);
    mockResolveCredential.mockReturnValue(
      ok({ type: 'accessToken', value: 'tok' }) as unknown as ReturnType<typeof resolveCredential>
    );

    await runTeamSelectFlow();

    expect(mockSelectAndPersist).toHaveBeenCalledWith(expect.anything(), { type: 'global' });
  });

  it('falls back to runLoginFlow when no credential resolves, then retries', async () => {
    mockFindProjectRoot.mockReturnValue('/repo');
    mockGetEntry.mockReturnValue({ root: '/repo', workspace: 'ws-1' } as RegisteredProject);
    mockResolveCredential
      .mockReturnValueOnce(
        err(new Error('unauthenticated')) as unknown as ReturnType<typeof resolveCredential>
      )
      .mockReturnValueOnce(
        ok({ type: 'apiKey', value: 'lin_api_key' }) as unknown as ReturnType<
          typeof resolveCredential
        >
      );
    mockRunLoginFlow.mockResolvedValue(undefined);

    await runTeamSelectFlow();

    expect(mockRunLoginFlow).toHaveBeenCalledOnce();
    expect(mockResolveCredential).toHaveBeenCalledTimes(2);
    expect(mockSelectAndPersist).toHaveBeenCalledWith(expect.anything(), {
      type: 'registry',
      root: '/repo',
    });
  });

  it('throws a helpful ValidationError when login + retry both fail and cwd is unlinked', async () => {
    mockFindProjectRoot.mockReturnValue(null);
    mockResolveCredential.mockReturnValue(
      err(new Error('unauthenticated')) as unknown as ReturnType<typeof resolveCredential>
    );
    mockRunLoginFlow.mockResolvedValue(undefined);

    await expect(runTeamSelectFlow()).rejects.toThrow(/linear login.*linear workspace select/i);
    expect(mockSelectAndPersist).not.toHaveBeenCalled();
  });
});
