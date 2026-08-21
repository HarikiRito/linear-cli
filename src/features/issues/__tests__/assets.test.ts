import { ok } from 'neverthrow';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { extractTrustedAssetUrls } from '../assets/download.js';

function makeIssueAssetsResponse(description: string | null, commentBodies: string[]) {
  return {
    issue: {
      id: 'issue-uuid',
      description,
      comments: { nodes: commentBodies.map((body) => ({ body })) },
    },
  };
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.clearAllMocks();
  vi.resetModules();
  process.exitCode = undefined;
});

describe('extractTrustedAssetUrls', () => {
  it('extracts uploads.linear.app URLs from markdown image/link syntax', () => {
    const text =
      '![](https://uploads.linear.app/a/b/screenshot.png) and [doc](https://uploads.linear.app/c/d/doc.pdf)';
    expect(extractTrustedAssetUrls(text)).toEqual([
      'https://uploads.linear.app/a/b/screenshot.png',
      'https://uploads.linear.app/c/d/doc.pdf',
    ]);
  });

  it('ignores URLs on hosts outside the trusted allowlist', () => {
    const text = 'see https://evil.example.com/steal and https://uploads.linear.app/a/b/ok.png';
    expect(extractTrustedAssetUrls(text)).toEqual(['https://uploads.linear.app/a/b/ok.png']);
  });

  it('de-duplicates repeated URLs, preserving first-seen order', () => {
    const text = 'https://uploads.linear.app/a/b/one.png https://uploads.linear.app/a/b/one.png';
    expect(extractTrustedAssetUrls(text)).toEqual(['https://uploads.linear.app/a/b/one.png']);
  });

  it('strips trailing sentence/markdown punctuation that is not part of the URL', () => {
    const text =
      'see https://uploads.linear.app/a/b/file.png. thanks, and **https://uploads.linear.app/c/d/other.pdf**!';
    expect(extractTrustedAssetUrls(text)).toEqual([
      'https://uploads.linear.app/a/b/file.png',
      'https://uploads.linear.app/c/d/other.pdf',
    ]);
  });
});

describe('downloadIssueAssets', () => {
  it('downloads only trusted assets found in the description and comments, with correct byte content', async () => {
    const requestFn = vi
      .fn()
      .mockResolvedValue(
        makeIssueAssetsResponse('Inline image: ![](https://uploads.linear.app/w/1/pic.png)', [
          'Untrusted link: https://evil.example.com/malware.exe',
          'Another asset: ![](https://uploads.linear.app/w/2/doc.pdf)',
        ])
      );
    const writeFileSyncFn = vi.fn();
    const mkdirSyncFn = vi.fn();
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      statusText: 'OK',
      arrayBuffer: () => Promise.resolve(new TextEncoder().encode('bytes').buffer),
    });
    vi.stubGlobal('fetch', fetchMock);

    vi.doMock('../../../lib/client/index.js', () => ({
      getClientWithAuthRetry: vi.fn().mockReturnValue(ok({})),
      getRequestFn: vi.fn().mockReturnValue(requestFn),
    }));
    vi.doMock('../../auth/resolve.js', () => ({
      resolveCredential: vi.fn().mockReturnValue(ok({ type: 'apiKey', value: 'lin_api_key' })),
    }));
    vi.doMock('../../../lib/runner.js', () => ({ exitError: vi.fn() }));
    vi.doMock('node:fs', () => ({ writeFileSync: writeFileSyncFn, mkdirSync: mkdirSyncFn }));

    const { downloadIssueAssets } = await import('../assets/download.js');
    await downloadIssueAssets({ issue: 'ENG-1' });

    // only the two uploads.linear.app URLs were fetched — the evil.example.com one was never touched
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock).toHaveBeenCalledWith(
      'https://uploads.linear.app/w/1/pic.png',
      expect.objectContaining({ headers: { Authorization: 'lin_api_key' } })
    );
    expect(fetchMock).toHaveBeenCalledWith(
      'https://uploads.linear.app/w/2/doc.pdf',
      expect.objectContaining({ headers: { Authorization: 'lin_api_key' } })
    );
    expect(writeFileSyncFn).toHaveBeenCalledWith('pic.png', Buffer.from('bytes'));
    expect(writeFileSyncFn).toHaveBeenCalledWith('doc.pdf', Buffer.from('bytes'));
  });

  it('writes into --output-dir and disambiguates same-named assets', async () => {
    const requestFn = vi
      .fn()
      .mockResolvedValue(
        makeIssueAssetsResponse(null, [
          '![](https://uploads.linear.app/w/1/image.png) ![](https://uploads.linear.app/w/2/image.png)',
        ])
      );
    const writeFileSyncFn = vi.fn();
    const mkdirSyncFn = vi.fn();
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      statusText: 'OK',
      arrayBuffer: () => Promise.resolve(new ArrayBuffer(0)),
    });
    vi.stubGlobal('fetch', fetchMock);

    vi.doMock('../../../lib/client/index.js', () => ({
      getClientWithAuthRetry: vi.fn().mockReturnValue(ok({})),
      getRequestFn: vi.fn().mockReturnValue(requestFn),
    }));
    vi.doMock('../../auth/resolve.js', () => ({
      resolveCredential: vi.fn().mockReturnValue(ok({ type: 'apiKey', value: 'lin_api_key' })),
    }));
    vi.doMock('../../../lib/runner.js', () => ({ exitError: vi.fn() }));
    vi.doMock('node:fs', () => ({ writeFileSync: writeFileSyncFn, mkdirSync: mkdirSyncFn }));

    const { downloadIssueAssets } = await import('../assets/download.js');
    await downloadIssueAssets({ issue: 'ENG-1', outputDir: 'out' });

    expect(mkdirSyncFn).toHaveBeenCalledWith('out', { recursive: true });
    expect(writeFileSyncFn).toHaveBeenCalledWith('out/image.png', expect.any(Buffer));
    expect(writeFileSyncFn).toHaveBeenCalledWith('out/image-2.png', expect.any(Buffer));
  });

  it('reports a message and does not fetch anything when no trusted assets are found', async () => {
    const requestFn = vi.fn().mockResolvedValue(makeIssueAssetsResponse('no links here', []));
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    vi.doMock('../../../lib/client/index.js', () => ({
      getClientWithAuthRetry: vi.fn().mockReturnValue(ok({})),
      getRequestFn: vi.fn().mockReturnValue(requestFn),
    }));
    vi.doMock('../../auth/resolve.js', () => ({
      resolveCredential: vi.fn().mockReturnValue(ok({ type: 'apiKey', value: 'lin_api_key' })),
    }));
    vi.doMock('../../../lib/runner.js', () => ({ exitError: vi.fn() }));
    vi.doMock('node:fs', () => ({ writeFileSync: vi.fn(), mkdirSync: vi.fn() }));

    const { downloadIssueAssets } = await import('../assets/download.js');
    await downloadIssueAssets({ issue: 'ENG-1' });

    expect(fetchMock).not.toHaveBeenCalled();
    const output = consoleSpy.mock.calls.map((c) => String(c[0])).join('\n');
    expect(output).toContain('No uploads.linear.app assets found');
  });
});
