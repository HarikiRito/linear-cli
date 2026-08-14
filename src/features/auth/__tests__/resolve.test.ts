import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { useTmpProjectAndHome } from '../../../../tests/helpers/tmp-env.js';
import { UnauthenticatedError } from '../../../lib/errors.js';
import { linkProject } from '../../keepalive/registry.js';
import { readWorkspaceCredential, writeWorkspaceCredential } from '../credentials.js';
import { resolveCredential } from '../resolve.js';
import { isApiKeySession, isOAuthSession } from '../session.js';

/**
 * resolveCredential precedence (integration-style, real files on disk):
 * flags > env > registry (cwd-linked workspace) > global default workspace
 * (LINEAR_WORKSPACE / config.workspace / single-workspace auto) > unauthenticated.
 */
describe('session type guards', () => {
  it('isApiKeySession returns true for apiKey session', () => {
    expect(isApiKeySession({ apiKey: 'k' })).toBe(true);
  });

  it('isOAuthSession returns true for oauth session', () => {
    expect(isOAuthSession({ accessToken: 'at', refreshToken: 'rt', expiresAt: 0 })).toBe(true);
  });
});

describe('resolveCredential: precedence chain (real files)', () => {
  const tmpEnv = useTmpProjectAndHome({
    projectPrefix: 'linear-resolve-precedence-',
    homePrefix: 'linear-resolve-home-',
    deleteEnvVars: ['LINEAR_API_KEY', 'LINEAR_ACCESS_TOKEN', 'LINEAR_WORKSPACE'],
  });

  /** Create a nested dir on disk and point cwd at it. */
  function cdIntoNested(): string {
    const nested = path.join(tmpEnv.projectDir, 'src', 'deep');
    fs.mkdirSync(nested, { recursive: true });
    process.cwd = () => nested;
    return nested;
  }

  it('apiKey flag wins over env var', async () => {
    process.env.LINEAR_API_KEY = 'env-key';
    const result = await resolveCredential({ apiKey: 'flag-key', allowInteractive: false });
    expect(result._unsafeUnwrap()).toEqual({ type: 'apiKey', value: 'flag-key' });
  });

  it('token flag wins over env var', async () => {
    process.env.LINEAR_ACCESS_TOKEN = 'env-token';
    const result = await resolveCredential({ token: 'flag-token', allowInteractive: false });
    expect(result._unsafeUnwrap()).toEqual({ type: 'accessToken', value: 'flag-token' });
  });

  it('LINEAR_API_KEY env var used when no flag', async () => {
    process.env.LINEAR_API_KEY = 'env-key';
    const result = await resolveCredential({ allowInteractive: false });
    expect(result._unsafeUnwrap()).toEqual({ type: 'apiKey', value: 'env-key' });
  });

  it('LINEAR_ACCESS_TOKEN env var used when no flag', async () => {
    process.env.LINEAR_ACCESS_TOKEN = 'env-token';
    const result = await resolveCredential({ allowInteractive: false });
    expect(result._unsafeUnwrap()).toEqual({ type: 'accessToken', value: 'env-token' });
  });

  it('cwd-linked workspace credential is used when cwd is inside the linked dir', async () => {
    await writeWorkspaceCredential('ws-1', { apiKey: 'linked-key' });
    await linkProject(tmpEnv.projectDir, 'ws-1');
    cdIntoNested();

    const result = await resolveCredential({ allowInteractive: false });
    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap()).toEqual({ type: 'apiKey', value: 'linked-key' });
  });

  it('linked workspace wins over LINEAR_WORKSPACE env and other stored workspaces', async () => {
    await writeWorkspaceCredential('ws-linked', { apiKey: 'linked-key' });
    await writeWorkspaceCredential('ws-other', { apiKey: 'other-key' });
    await linkProject(tmpEnv.projectDir, 'ws-linked');
    cdIntoNested();
    process.env.LINEAR_WORKSPACE = 'ws-other';

    const result = await resolveCredential({ allowInteractive: false });
    expect(result._unsafeUnwrap()).toEqual({ type: 'apiKey', value: 'linked-key' });
  });

  it('LINEAR_WORKSPACE env picks a specific stored workspace', async () => {
    await writeWorkspaceCredential('ws-a', { apiKey: 'a-key' });
    await writeWorkspaceCredential('ws-b', { apiKey: 'b-key' });
    process.env.LINEAR_WORKSPACE = 'ws-b';

    const result = await resolveCredential({ allowInteractive: false });
    expect(result._unsafeUnwrap()).toEqual({ type: 'apiKey', value: 'b-key' });
  });

  it('global config workspace picks a specific stored workspace', async () => {
    await writeWorkspaceCredential('ws-a', { apiKey: 'a-key' });
    await writeWorkspaceCredential('ws-cfg', { apiKey: 'cfg-key' });
    fs.mkdirSync(path.join(tmpEnv.homeDir, '.config', '.linear'), { recursive: true });
    fs.writeFileSync(
      path.join(tmpEnv.homeDir, '.config', '.linear', 'config.toml'),
      'workspace = "ws-cfg"\n',
      'utf-8'
    );

    const result = await resolveCredential({ allowInteractive: false });
    expect(result._unsafeUnwrap()).toEqual({ type: 'apiKey', value: 'cfg-key' });
  });

  it('auto-uses the single stored workspace when none is configured', async () => {
    await writeWorkspaceCredential('ws-solo', { apiKey: 'solo-key' });

    const result = await resolveCredential({ allowInteractive: false });
    expect(result._unsafeUnwrap()).toEqual({ type: 'apiKey', value: 'solo-key' });
  });

  it('returns UnauthenticatedError when nothing is stored (non-TTY)', async () => {
    const result = await resolveCredential({ allowInteractive: false });
    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr()).toBeInstanceOf(UnauthenticatedError);
  });

  it('UnauthenticatedError message mentions how to authenticate', async () => {
    const result = await resolveCredential({ allowInteractive: false });
    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr().message).toContain('linear login');
  });

  it('apiKey credential round-trips through the workspace store', async () => {
    await writeWorkspaceCredential('ws-rt', { apiKey: 'rt-key' });
    expect(await readWorkspaceCredential('ws-rt')).toEqual({ apiKey: 'rt-key' });
  });
});
