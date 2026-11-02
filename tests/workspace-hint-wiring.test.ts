import { afterEach, describe, expect, it, vi } from 'vitest';
import { writeWorkspaceCredential } from '../src/features/auth/credentials.js';
import { useTmpProjectAndHome } from './helpers/tmp-env.js';

const orgs: Record<string, { name: string; urlKey: string; teams: string[] }> = {
  'k-a': { name: 'Acme', urlKey: 'acme', teams: ['ENG'] },
  'k-b': { name: 'Beta', urlKey: 'beta', teams: ['OPS'] },
};

vi.mock('@linear/sdk', async () => ({
  ...(await vi.importActual<object>('@linear/sdk')),
  LinearClient: class {
    private readonly org: (typeof orgs)[string];
    constructor(opts: { apiKey: string }) {
      this.org = orgs[opts.apiKey];
    }
    get organization() {
      return Promise.resolve(this.org);
    }
    teams() {
      return Promise.resolve({ nodes: this.org.teams.map((key) => ({ key })) });
    }
  },
}));

vi.mock('../src/features/keepalive/command.js', async () => ({
  ...(await vi.importActual<object>('../src/features/keepalive/command.js')),
  checkSchedulerHealth: vi.fn(),
}));

const resolved: string[] = [];

vi.mock('../src/features/issues/get/get.js', async () => {
  const { resolveCredential } = await import('../src/features/auth/resolve.js');
  return { getIssue: async () => resolved.push((await resolveCredential())._unsafeUnwrap().value) };
});

vi.mock('../src/features/labels/list.js', async () => {
  const { resolveCredential } = await import('../src/features/auth/resolve.js');
  return {
    listLabels: async () => resolved.push((await resolveCredential())._unsafeUnwrap().value),
  };
});

describe('program sets the workspace hint from the command line', () => {
  useTmpProjectAndHome({
    projectPrefix: 'linear-wiring-project-',
    homePrefix: 'linear-wiring-home-',
    deleteEnvVars: ['LINEAR_API_KEY', 'LINEAR_ACCESS_TOKEN', 'LINEAR_WORKSPACE'],
  });

  afterEach(() => {
    resolved.length = 0;
  });

  async function run(...args: string[]): Promise<void> {
    await writeWorkspaceCredential('ws-a', { apiKey: 'k-a' });
    await writeWorkspaceCredential('ws-b', { apiKey: 'k-b' });
    const { createProgram } = await import('../src/program.js');
    await createProgram().parseAsync(['node', 'linear', ...args]);
  }

  it('issue id team key', async () => {
    await run('issues', 'get', 'OPS-7');
    expect(resolved).toEqual(['k-b']);
  });

  it('issue URL workspace', async () => {
    await run('issues', 'get', 'https://linear.app/acme/issue/OPS-7/slug');
    expect(resolved).toEqual(['k-a']);
  });

  it('--team flag', async () => {
    await run('labels', 'list', '--team', 'eng');
    expect(resolved).toEqual(['k-a']);
  });
});
