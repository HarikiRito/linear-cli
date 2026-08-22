import { ok } from 'neverthrow';
import { afterEach, describe, expect, it, vi } from 'vitest';

afterEach(() => {
  vi.restoreAllMocks();
  vi.clearAllMocks();
  vi.resetModules();
  process.exitCode = undefined;
});

describe('downloadAsset', () => {
  it('downloads a trusted uploads.linear.app URL with correct byte content and derived filename', async () => {
    const writeFileSyncFn = vi.fn();
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      statusText: 'OK',
      arrayBuffer: () => Promise.resolve(new TextEncoder().encode('hello world').buffer),
    });
    vi.stubGlobal('fetch', fetchMock);

    vi.doMock('../../auth/resolve.js', () => ({
      resolveCredential: vi.fn().mockReturnValue(ok({ type: 'apiKey', value: 'lin_api_key' })),
    }));
    vi.doMock('../../../lib/runner.js', () => ({ exitError: vi.fn() }));
    vi.doMock('node:fs', () => ({ writeFileSync: writeFileSyncFn }));

    const { downloadAsset } = await import('../download.js');
    await downloadAsset({ url: 'https://uploads.linear.app/w/1/notes.txt' });

    expect(fetchMock).toHaveBeenCalledWith(
      'https://uploads.linear.app/w/1/notes.txt',
      expect.objectContaining({ headers: { Authorization: 'lin_api_key' } })
    );
    expect(writeFileSyncFn).toHaveBeenCalledWith('notes.txt', Buffer.from('hello world'));
  });

  it('writes to the given --output path', async () => {
    const writeFileSyncFn = vi.fn();
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      statusText: 'OK',
      arrayBuffer: () => Promise.resolve(new ArrayBuffer(0)),
    });
    vi.stubGlobal('fetch', fetchMock);

    vi.doMock('../../auth/resolve.js', () => ({
      resolveCredential: vi.fn().mockReturnValue(ok({ type: 'apiKey', value: 'lin_api_key' })),
    }));
    vi.doMock('../../../lib/runner.js', () => ({ exitError: vi.fn() }));
    vi.doMock('node:fs', () => ({ writeFileSync: writeFileSyncFn }));

    const { downloadAsset } = await import('../download.js');
    await downloadAsset({
      url: 'https://uploads.linear.app/w/1/notes.txt',
      output: '/tmp/out.txt',
    });

    expect(writeFileSyncFn).toHaveBeenCalledWith('/tmp/out.txt', expect.any(Buffer));
  });

  it('does not send credentials to a non-allowlisted host', async () => {
    const writeFileSyncFn = vi.fn();
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      statusText: 'OK',
      arrayBuffer: () => Promise.resolve(new ArrayBuffer(0)),
    });
    vi.stubGlobal('fetch', fetchMock);
    vi.spyOn(console, 'error').mockImplementation(() => {});

    vi.doMock('../../auth/resolve.js', () => ({
      resolveCredential: vi.fn().mockReturnValue(ok({ type: 'apiKey', value: 'lin_api_key' })),
    }));
    vi.doMock('../../../lib/runner.js', () => ({ exitError: vi.fn() }));
    vi.doMock('node:fs', () => ({ writeFileSync: writeFileSyncFn }));

    const { downloadAsset } = await import('../download.js');
    await downloadAsset({ url: 'https://evil.example.com/notes.txt' });

    expect(fetchMock).toHaveBeenCalledWith('https://evil.example.com/notes.txt', { headers: {} });
    const sentHeaders = fetchMock.mock.calls[0]?.[1]?.headers as Record<string, string>;
    expect(sentHeaders.Authorization).toBeUndefined();
  });

  it('reports an error when the asset GET returns a non-2xx response', async () => {
    const exitErrorFn = vi.fn();
    const writeFileSyncFn = vi.fn();
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
      statusText: 'Not Found',
    });
    vi.stubGlobal('fetch', fetchMock);

    vi.doMock('../../auth/resolve.js', () => ({
      resolveCredential: vi.fn().mockReturnValue(ok({ type: 'apiKey', value: 'lin_api_key' })),
    }));
    vi.doMock('../../../lib/runner.js', () => ({ exitError: exitErrorFn }));
    vi.doMock('node:fs', () => ({ writeFileSync: writeFileSyncFn }));

    const { downloadAsset } = await import('../download.js');
    await downloadAsset({ url: 'https://uploads.linear.app/w/1/missing.txt' });

    expect(exitErrorFn).toHaveBeenCalledWith(
      expect.objectContaining({
        message: expect.stringContaining('Asset download failed (404): Not Found'),
      })
    );
    expect(writeFileSyncFn).not.toHaveBeenCalled();
  });
});
