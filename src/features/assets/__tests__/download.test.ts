import fs from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it, type Mock, vi } from 'vitest';
import { useTmpProjectAndHome } from '../../../../tests/helpers/tmp-env.js';
import { writeWorkspaceCredential } from '../../auth/credentials.js';
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
