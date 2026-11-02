import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { useTmpProjectAndHome } from '../../../../tests/helpers/tmp-env.js';
import { writeWorkspaceCredential } from '../credentials.js';
import { resolveHintWorkspaceId } from '../workspace-lookup.js';

interface FakeWorkspace {
  name: string;
  urlKey: string;
  teams: string[];
  fails?: boolean;
}

const workspaces: Record<string, FakeWorkspace> = {};
const listCalls: string[] = [];

vi.mock('@linear/sdk', () => ({
  LinearClient: class {
    private readonly ws: FakeWorkspace;
    constructor(opts: { apiKey: string }) {
      this.ws = workspaces[opts.apiKey];
      listCalls.push(opts.apiKey);
    }
    get organization() {
      return this.ws.fails
        ? Promise.reject(new Error('Authentication required'))
        : Promise.resolve({ name: this.ws.name, urlKey: this.ws.urlKey });
    }
    teams() {
      return Promise.resolve({ nodes: this.ws.teams.map((key) => ({ key })) });
    }
  },
}));

describe('resolveHintWorkspaceId', () => {
  const tmpEnv = useTmpProjectAndHome({
    projectPrefix: 'linear-lookup-project-',
    homePrefix: 'linear-lookup-home-',
  });

  async function store(id: string, ws: FakeWorkspace): Promise<void> {
    workspaces[id] = ws;
    await writeWorkspaceCredential(id, { apiKey: id });
  }

  function reset(): void {
    for (const k of Object.keys(workspaces)) delete workspaces[k];
    listCalls.length = 0;
  }

  const team = (key: string) => resolveHintWorkspaceId({ kind: 'team', key });

  it('resolves a unique team key, then serves repeats from the cache without listing', async () => {
    reset();
    await store('ws-a', { name: 'Acme', urlKey: 'acme', teams: ['ENG'] });
    await store('ws-b', { name: 'Beta', urlKey: 'beta', teams: ['OPS'] });

    expect((await team('ENG'))._unsafeUnwrap()).toBe('ws-a');
    expect(listCalls).toHaveLength(2);
    expect((await team('OPS'))._unsafeUnwrap()).toBe('ws-b');
    expect(listCalls).toHaveLength(2);
  });

  it('relists once on a miss and finds a team added since', async () => {
    reset();
    await store('ws-a', { name: 'Acme', urlKey: 'acme', teams: ['ENG'] });
    await team('ENG');
    workspaces['ws-a'].teams.push('NEW');
    listCalls.length = 0;

    expect((await team('NEW'))._unsafeUnwrap()).toBe('ws-a');
    expect(listCalls).toHaveLength(1);
  });

  it('relists when the stored workspace set changed', async () => {
    reset();
    await store('ws-a', { name: 'Acme', urlKey: 'acme', teams: ['ENG'] });
    await team('ENG');
    await store('ws-b', { name: 'Beta', urlKey: 'beta', teams: ['ENG'] });

    const err = (await team('ENG'))._unsafeUnwrapErr();
    expect(err.message).toContain('multiple stored workspaces');
    expect(err.message).toContain('Acme');
    expect(err.message).toContain('Beta');
    expect(err.message).toContain('LINEAR_WORKSPACE');
  });

  it('treats a corrupt cache file as a miss', async () => {
    reset();
    await store('ws-a', { name: 'Acme', urlKey: 'acme', teams: ['ENG'] });
    const dir = path.join(tmpEnv.homeDir, '.config', '.linear');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'workspace-index.json'), '{not json');

    expect((await team('ENG'))._unsafeUnwrap()).toBe('ws-a');
    expect(listCalls).toHaveLength(1);
  });

  it('errors listing checked workspaces when the key exists nowhere', async () => {
    reset();
    await store('ws-a', { name: 'Acme', urlKey: 'acme', teams: ['ENG'] });
    await store('ws-b', { name: 'Beta', urlKey: 'beta', teams: ['OPS'] });

    const err = (await team('ZZZ'))._unsafeUnwrapErr();
    expect(err.message).toContain("Team key 'ZZZ' not found in any stored workspace");
    expect(err.message).toContain('Acme');
    expect(err.message).toContain('Beta');
  });

  it('skips an unreachable workspace silently when another matches', async () => {
    reset();
    await store('ws-a', { name: 'Acme', urlKey: 'acme', teams: ['ENG'], fails: true });
    await store('ws-b', { name: 'Beta', urlKey: 'beta', teams: ['ENG'] });

    expect((await team('ENG'))._unsafeUnwrap()).toBe('ws-b');
  });

  it('names the unreachable workspace only when nothing matched', async () => {
    reset();
    await store('ws-a', { name: 'Acme', urlKey: 'acme', teams: ['ENG'], fails: true });
    await store('ws-b', { name: 'Beta', urlKey: 'beta', teams: ['OPS'] });

    const err = (await team('ENG'))._unsafeUnwrapErr();
    expect(err.message).toContain('Could not check');
    expect(err.message).toContain('ws-a');
  });

  it('resolves an issue URL workspace key; unknown key errors', async () => {
    reset();
    await store('ws-a', { name: 'Acme', urlKey: 'acme', teams: ['ENG'] });

    expect((await resolveHintWorkspaceId({ kind: 'url', urlKey: 'acme' }))._unsafeUnwrap()).toBe(
      'ws-a'
    );
    const err = (await resolveHintWorkspaceId({ kind: 'url', urlKey: 'nope' }))._unsafeUnwrapErr();
    expect(err.message).toContain("Workspace 'nope'");
    expect(err.message).toContain('Acme');
  });
});
