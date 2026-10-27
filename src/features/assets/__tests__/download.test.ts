import fs from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it, type Mock, vi } from 'vitest';
import { useTmpProjectAndHome } from '../../../../tests/helpers/tmp-env.js';
import { readWorkspaceCredential, writeWorkspaceCredential } from '../../auth/credentials.js';
import { linkProject } from '../../keepalive/registry.js';
import { downloadAsset } from '../download.js';

/** fetch stub returning `body` as bytes with a configurable HTTP status. */
function stubFetch(body = 'hello world', init: { status?: number; statusText?: string } = {}) {
  const status = init.status ?? 200;
  const fetchMock = vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    statusText: init.statusText ?? (status === 200 ? 'OK' : ''),
    arrayBuffer: () => Promise.resolve(new TextEncoder().encode(body).buffer),
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

function sentHeaders(fetchMock: Mock): Record<string, string> {
  return (fetchMock.mock.calls[0]?.[1]?.headers ?? {}) as Record<string, string>;
}

/**
 * fetch stub that answers the OAuth token endpoint with a rotated token and
 * asset GETs with `body`, so refresh + download share one global fetch.
 */
function stubFetchWithRefresh(body = 'hello world', refreshedToken = 'refreshed-at') {
  const fetchMock = vi.fn().mockImplementation((url: string) =>
    url.includes('/oauth/token')
      ? Promise.resolve({
          ok: true,
          status: 200,
          json: () =>
            Promise.resolve({
              access_token: refreshedToken,
              refresh_token: 'new-rt',
              expires_in: 3600,
            }),
        })
      : Promise.resolve({
          ok: true,
          status: 200,
          statusText: 'OK',
          arrayBuffer: () => Promise.resolve(new TextEncoder().encode(body).buffer),
        })
  );
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

function sentAssetHeaders(fetchMock: Mock): Record<string, string> {
  const call = fetchMock.mock.calls.find(([url]) => String(url).includes('uploads.linear.app'));
  return (call?.[1]?.headers ?? {}) as Record<string, string>;
}

describe('downloadAsset', () => {
  const tmpEnv = useTmpProjectAndHome({
    projectPrefix: 'linear-asset-download-',
    homePrefix: 'linear-asset-home-',
    deleteEnvVars: ['LINEAR_API_KEY', 'LINEAR_ACCESS_TOKEN', 'LINEAR_WORKSPACE'],
    extraTeardown: () => {
      process.exitCode = undefined;
    },
  });

  /**
   * Store credentials for the given workspaces, link the temp project dir to
   * `linkedWorkspace`, and point process.cwd at it. Output paths in tests must
   * be absolute: only the JS-level process.cwd is stubbed.
   */
  async function setupWorkspaces(
    stored: Record<string, string>,
    linkedWorkspace: string
  ): Promise<void> {
    for (const [id, key] of Object.entries(stored)) {
      await writeWorkspaceCredential(id, { apiKey: key });
    }
    await linkProject(tmpEnv.projectDir, linkedWorkspace);
    process.cwd = () => tmpEnv.projectDir;
  }

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('uses the URL workspace credential, not the linked one, and writes the bytes', async () => {
    await setupWorkspaces({ 'ws-a': 'token-a', 'ws-b': 'token-b' }, 'ws-a');
    const fetchMock = stubFetch('hello world');
    const output = path.join(tmpEnv.projectDir, 'notes.txt');

    await downloadAsset({ url: 'https://uploads.linear.app/ws-b/asset-1/notes.txt', output });

    expect(sentHeaders(fetchMock)).toEqual({ Authorization: 'token-b' });
    expect(fs.readFileSync(output, 'utf-8')).toBe('hello world');
    expect(process.exitCode).toBeUndefined();
  });

  it('fails with a workspace-naming UnauthenticatedError when the URL workspace is not stored', async () => {
    await setupWorkspaces({ 'ws-a': 'token-a' }, 'ws-a');
    const fetchMock = stubFetch();
    const errorLog = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const output = path.join(tmpEnv.projectDir, 'notes.txt');

    await downloadAsset({ url: 'https://uploads.linear.app/ws-b/asset-1/notes.txt', output });

    expect(fetchMock).not.toHaveBeenCalled();
    expect(process.exitCode).toBe(1);
    expect(fs.existsSync(output)).toBe(false);
    const message = errorLog.mock.calls.map((call) => call.join(' ')).join('\n');
    expect(message).toContain('ws-b');
    expect(message).toContain('not logged in');
    expect(message).toContain('linear login');
    expect(message).not.toContain('token-a');
  });

  it('keeps current-workspace downloads on the linked credential', async () => {
    await setupWorkspaces({ 'ws-a': 'token-a' }, 'ws-a');
    const fetchMock = stubFetch();

    await downloadAsset({
      url: 'https://uploads.linear.app/ws-a/asset-1/notes.txt',
      output: path.join(tmpEnv.projectDir, 'notes.txt'),
    });

    expect(sentHeaders(fetchMock)).toEqual({ Authorization: 'token-a' });
    expect(process.exitCode).toBeUndefined();
  });

  it('percent-decodes the workspace id from the asset URL', async () => {
    await setupWorkspaces({ 'ws-a': 'token-a', 'ws-b': 'token-b' }, 'ws-a');
    const fetchMock = stubFetch();

    await downloadAsset({
      url: 'https://uploads.linear.app/ws%2Db/asset-1/notes.txt',
      output: path.join(tmpEnv.projectDir, 'notes.txt'),
    });

    expect(sentHeaders(fetchMock)).toEqual({ Authorization: 'token-b' });
    expect(process.exitCode).toBeUndefined();
  });

  it('refreshes an expired OAuth credential for the URL workspace and writes it back only there', async () => {
    await setupWorkspaces({ 'ws-a': 'token-a' }, 'ws-a');
    await writeWorkspaceCredential('ws-b', {
      accessToken: 'stale-at',
      refreshToken: 'old-rt',
      expiresAt: 0,
    });
    const fetchMock = stubFetchWithRefresh('hello world', 'refreshed-at');
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);

    await downloadAsset({
      url: 'https://uploads.linear.app/ws-b/asset-1/notes.txt',
      output: path.join(tmpEnv.projectDir, 'notes.txt'),
    });

    expect(sentAssetHeaders(fetchMock)).toEqual({ Authorization: 'Bearer refreshed-at' });
    expect(log.mock.calls.flat().join(' ')).not.toContain('refreshed-at');
    expect(await readWorkspaceCredential('ws-b')).toMatchObject({
      accessToken: 'refreshed-at',
      refreshToken: 'new-rt',
    });
    expect(await readWorkspaceCredential('ws-a')).toEqual({ apiKey: 'token-a' });
    expect(process.exitCode).toBeUndefined();
  });

  it('writes the URL last segment when --output is omitted', async () => {
    const realCwd = process.cwd();
    await setupWorkspaces({ 'ws-b': 'token-b' }, 'ws-b');
    stubFetch('default-name-bytes');

    process.chdir(tmpEnv.projectDir);
    try {
      await downloadAsset({ url: 'https://uploads.linear.app/ws-b/asset-1/asset.png' });
    } finally {
      process.chdir(realCwd);
    }

    expect(fs.readFileSync(path.join(tmpEnv.projectDir, 'asset.png'), 'utf-8')).toBe(
      'default-name-bytes'
    );
    expect(process.exitCode).toBeUndefined();
  });

  it('explicit --api-key and LINEAR_API_KEY win over the URL workspace', async () => {
    await setupWorkspaces({ 'ws-b': 'token-b' }, 'ws-a');
    const flagFetch = stubFetch();
    const output = path.join(tmpEnv.projectDir, 'notes.txt');

    await downloadAsset({
      url: 'https://uploads.linear.app/ws-b/asset-1/notes.txt',
      apiKey: 'flag-key',
      output,
    });
    expect(sentHeaders(flagFetch)).toEqual({ Authorization: 'flag-key' });

    process.env.LINEAR_API_KEY = 'env-key';
    const envFetch = stubFetch();
    await downloadAsset({ url: 'https://uploads.linear.app/ws-b/asset-1/notes.txt', output });
    expect(sentHeaders(envFetch)).toEqual({ Authorization: 'env-key' });
  });

  it('downloads from an untrusted host anonymously with a warning', async () => {
    await setupWorkspaces({ 'ws-a': 'token-a', 'ws-b': 'token-b' }, 'ws-a');
    const fetchMock = stubFetch('');
    const warnLog = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    await downloadAsset({
      url: 'https://evil.example.com/ws-b/notes.txt',
      output: path.join(tmpEnv.projectDir, 'notes.txt'),
    });

    expect(sentHeaders(fetchMock)).toEqual({});
    expect(warnLog).toHaveBeenCalledWith(expect.stringContaining('not a trusted Linear domain'));
    expect(process.exitCode).toBeUndefined();
  });

  it('rejects a malformed trusted-looking URL with a ValidationError before fetching', async () => {
    await setupWorkspaces({ 'ws-b': 'token-b' }, 'ws-b');
    const fetchMock = stubFetch();
    const errorLog = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    await downloadAsset({ url: 'uploads.linear.app/ws-b/asset-1/notes.txt' });

    expect(fetchMock).not.toHaveBeenCalled();
    expect(process.exitCode).toBe(1);
    const message = errorLog.mock.calls.map((call) => call.join(' ')).join('\n');
    expect(message).toContain('Invalid asset URL');
  });

  it('reports an error when the asset GET returns a non-2xx response', async () => {
    await setupWorkspaces({ 'ws-b': 'token-b' }, 'ws-b');
    stubFetch('', { status: 404, statusText: 'Not Found' });
    const errorLog = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const output = path.join(tmpEnv.projectDir, 'missing.txt');

    await downloadAsset({ url: 'https://uploads.linear.app/ws-b/asset-1/missing.txt', output });

    expect(errorLog).toHaveBeenCalledWith(expect.stringContaining('Asset download failed (404)'));
    expect(process.exitCode).toBe(1);
    expect(fs.existsSync(output)).toBe(false);
  });
});
