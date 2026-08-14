import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { writeWorkspaceCredential } from '../src/features/auth/credentials.js';
import { resolveCredential } from '../src/features/auth/resolve.js';
import { linkProject } from '../src/features/keepalive/registry.js';
import { UnauthenticatedError } from '../src/lib/errors.js';
import { useTmpProjectAndHome } from './helpers/tmp-env.js';

/**
 * resolveCredential precedence (real credentials.json + projects.json in temp
 * HOME): flags > env > registry (cwd-linked workspace) > global default
 * workspace (LINEAR_WORKSPACE / single-workspace auto) > unauthenticated.
 */
describe('Credential resolution order', () => {
  const tmpEnv = useTmpProjectAndHome({
    projectPrefix: 'linear-cred-res-project-',
    homePrefix: 'linear-cred-res-home-',
    deleteEnvVars: ['LINEAR_API_KEY', 'LINEAR_ACCESS_TOKEN', 'LINEAR_WORKSPACE'],
    extraTeardown: () => {
      process.exitCode = undefined;
    },
  });

  /** Point cwd at a real nested dir inside the project dir. */
  function cdIntoProject(): string {
    const nested = path.join(tmpEnv.projectDir, 'src', 'feature');
    fs.mkdirSync(nested, { recursive: true });
    process.cwd = () => nested;
    return nested;
  }

  it('--api-key flag takes priority over env var', async () => {
    process.env.LINEAR_API_KEY = 'env-key';
    const result = await resolveCredential({ apiKey: 'flag-key', allowInteractive: false });
    expect(result._unsafeUnwrap()).toEqual({ type: 'apiKey', value: 'flag-key' });
  });

  it('--token flag takes priority over env var', async () => {
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

  it('uses the cwd-linked workspace credential when inside a linked directory', async () => {
    await writeWorkspaceCredential('ws-proj', { apiKey: 'proj-key' });
    await linkProject(tmpEnv.projectDir, 'ws-proj');
    cdIntoProject();

    const result = await resolveCredential({ allowInteractive: false });
    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap()).toEqual({ type: 'apiKey', value: 'proj-key' });
  });

  it('linked workspace credential wins over an unrelated global workspace', async () => {
    await writeWorkspaceCredential('ws-linked', { apiKey: 'linked-key' });
    await writeWorkspaceCredential('ws-other', { apiKey: 'other-key' });
    await linkProject(tmpEnv.projectDir, 'ws-linked');
    cdIntoProject();
    process.env.LINEAR_WORKSPACE = 'ws-other';

    const result = await resolveCredential({ allowInteractive: false });
    expect(result._unsafeUnwrap()).toEqual({ type: 'apiKey', value: 'linked-key' });
  });

  it('LINEAR_WORKSPACE picks the matching stored workspace when not linked', async () => {
    await writeWorkspaceCredential('ws-a', { apiKey: 'a-key' });
    await writeWorkspaceCredential('ws-b', { apiKey: 'b-key' });
    process.env.LINEAR_WORKSPACE = 'ws-b';

    const result = await resolveCredential({ allowInteractive: false });
    expect(result._unsafeUnwrap()).toEqual({ type: 'apiKey', value: 'b-key' });
  });

  it('uses the single stored workspace automatically when nothing is configured', async () => {
    await writeWorkspaceCredential('ws-solo', { apiKey: 'solo-key' });

    const result = await resolveCredential({ allowInteractive: false });
    expect(result._unsafeUnwrap()).toEqual({ type: 'apiKey', value: 'solo-key' });
  });

  it('reads a non-expired OAuth workspace credential as accessToken', async () => {
    await writeWorkspaceCredential('ws-oauth', {
      accessToken: 'session-token',
      refreshToken: 'session-refresh',
      expiresAt: Date.now() + 86400000,
    });

    const result = await resolveCredential({ allowInteractive: false });
    expect(result._unsafeUnwrap()).toEqual({ type: 'accessToken', value: 'session-token' });
  });

  it('returns UnauthenticatedError when no credentials in non-TTY context', async () => {
    const result = await resolveCredential({ allowInteractive: false });
    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr()).toBeInstanceOf(UnauthenticatedError);
  });

  it('UnauthenticatedError message mentions how to authenticate', async () => {
    const result = await resolveCredential({ allowInteractive: false });
    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr().message).toContain('linear login');
  });
});
