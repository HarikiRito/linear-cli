import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { okAsync } from 'neverthrow';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useTmpProjectAndHome } from '../../../../tests/helpers/tmp-env.js';
import { linkProject } from '../../keepalive/registry.js';
import { writeWorkspaceCredential } from '../credentials.js';
import { resolveCredential } from '../resolve.js';
import { setWorkspaceHint } from '../workspace-hint.js';

const clientCount = { n: 0 };
const refreshAccessToken = vi.hoisted(() => vi.fn());

vi.mock('../oauth.js', () => ({ refreshAccessToken }));

const orgs: Record<string, { name: string; urlKey: string; teams: string[] }> = {
  'k-a': { name: 'Acme', urlKey: 'acme', teams: ['ENG'] },
  'k-b': { name: 'Beta', urlKey: 'beta', teams: ['OPS', 'DUP'] },
  'k-c': { name: 'Gamma', urlKey: 'gamma', teams: ['DUP'] },
  'new-token': { name: 'Omega', urlKey: 'omega', teams: ['OAUTH'] },
};

vi.mock('@linear/sdk', () => ({
  LinearClient: class {
    private readonly org: (typeof orgs)[string];
    constructor(opts: { apiKey?: string; accessToken?: string }) {
      clientCount.n++;
      this.org = orgs[(opts.apiKey ?? opts.accessToken) as string];
    }
    get organization() {
      return Promise.resolve(this.org);
    }
    teams() {
      return Promise.resolve({ nodes: this.org.teams.map((key) => ({ key })) });
    }
  },
}));

describe('resolveCredential: workspace hints', () => {
  beforeEach(() => {
    refreshAccessToken.mockImplementation(() =>
      okAsync({ accessToken: 'new-token', refreshToken: 'rt-2', expiresAt: Date.now() + 3600_000 })
    );
  });

  const tmpEnv = useTmpProjectAndHome({
    projectPrefix: 'linear-hint-project-',
    homePrefix: 'linear-hint-home-',
    deleteEnvVars: ['LINEAR_API_KEY', 'LINEAR_ACCESS_TOKEN', 'LINEAR_WORKSPACE'],
  });

  afterEach(() => setWorkspaceHint(null));

  async function storeAll(): Promise<void> {
    await writeWorkspaceCredential('ws-a', { apiKey: 'k-a' });
    await writeWorkspaceCredential('ws-b', { apiKey: 'k-b' });
  }

  const resolveValue = async () => (await resolveCredential())._unsafeUnwrap().value;

  it('team key picks the workspace that has it', async () => {
    await storeAll();
    setWorkspaceHint({ kind: 'team', key: 'OPS' });
    expect(await resolveValue()).toBe('k-b');
  });

  it('issue URL picks the workspace named in the URL', async () => {
    await storeAll();
    setWorkspaceHint({ kind: 'url', urlKey: 'acme' });
    expect(await resolveValue()).toBe('k-a');
  });

  it('team key in two workspaces errors', async () => {
    await storeAll();
    await writeWorkspaceCredential('ws-c', { apiKey: 'k-c' });
    setWorkspaceHint({ kind: 'team', key: 'DUP' });
    expect((await resolveCredential())._unsafeUnwrapErr().message).toContain(
      'multiple stored workspaces'
    );
  });

  it('a team hint matching nothing errors when 2+ workspaces are stored', async () => {
    await storeAll();
    setWorkspaceHint({ kind: 'team', key: 'ZZZ' });
    expect((await resolveCredential())._unsafeUnwrapErr().message).toContain('not found');
  });

  it('a team hint with one stored workspace uses it without any lookup', async () => {
    await writeWorkspaceCredential('ws-a', { apiKey: 'k-a' });
    clientCount.n = 0;
    setWorkspaceHint({ kind: 'team', key: 'ZZZ' });
    expect(await resolveValue()).toBe('k-a');
    expect(clientCount.n).toBe(0);
  });

  it('an expired OAuth workspace is refreshed exactly once when the hint misses the cache', async () => {
    await writeWorkspaceCredential('ws-a', { apiKey: 'k-a' });
    await writeWorkspaceCredential('ws-o', {
      accessToken: 'old',
      refreshToken: 'rt-1',
      expiresAt: Date.now() - 1000,
    });
    refreshAccessToken.mockClear();
    setWorkspaceHint({ kind: 'team', key: 'OAUTH' });
    expect(await resolveValue()).toBe('new-token');
    expect(refreshAccessToken).toHaveBeenCalledTimes(1);
  });

  it('an unknown issue-URL workspace errors even with one stored workspace', async () => {
    await writeWorkspaceCredential('ws-a', { apiKey: 'k-a' });
    setWorkspaceHint({ kind: 'url', urlKey: 'nope' });
    expect((await resolveCredential())._unsafeUnwrapErr().message).toContain("Workspace 'nope'");
  });

  it('single stored workspace is used without a hint', async () => {
    await writeWorkspaceCredential('ws-a', { apiKey: 'k-a' });
    expect(await resolveValue()).toBe('k-a');
  });

  it('folder link wins over a hint for another workspace', async () => {
    await storeAll();
    await linkProject(tmpEnv.projectDir, 'ws-a');
    process.cwd = () => tmpEnv.projectDir;
    setWorkspaceHint({ kind: 'team', key: 'OPS' });
    expect(await resolveValue()).toBe('k-a');
  });

  it('worktree link wins over a hint for another workspace', async () => {
    await storeAll();
    const main = path.join(tmpEnv.projectDir, 'main');
    const worktree = path.join(tmpEnv.projectDir, 'wt');
    fs.mkdirSync(main);
    const git = (...args: string[]) =>
      execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', ...args], {
        cwd: main,
        stdio: 'pipe',
      });
    git('init', '-q');
    git('commit', '-q', '--allow-empty', '-m', 'init');
    git('worktree', 'add', '-q', worktree);
    await linkProject(fs.realpathSync(main), 'ws-a');
    process.cwd = () => worktree;
    setWorkspaceHint({ kind: 'team', key: 'OPS' });
    expect(await resolveValue()).toBe('k-a');
  });

  it('LINEAR_WORKSPACE wins over a hint for another workspace', async () => {
    await storeAll();
    process.env.LINEAR_WORKSPACE = 'ws-a';
    setWorkspaceHint({ kind: 'team', key: 'OPS' });
    expect(await resolveValue()).toBe('k-a');
  });
});
