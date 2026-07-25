import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchLatestVersion, isNewerVersion } from '../check-version.js';

// ---------------------------------------------------------------------------
// isNewerVersion — pure semver comparison
// ---------------------------------------------------------------------------

describe('isNewerVersion', () => {
  it('equal versions → false', () => {
    expect(isNewerVersion('0.3.0', '0.3.0')).toBe(false);
  });

  it('installed older than latest patch → true', () => {
    expect(isNewerVersion('0.3.0', '0.3.1')).toBe(true);
  });

  it('installed older than latest minor → true', () => {
    expect(isNewerVersion('0.3.0', '0.4.0')).toBe(true);
  });

  it('installed older than latest major → true', () => {
    expect(isNewerVersion('0.3.0', '1.0.0')).toBe(true);
  });

  it('installed newer than latest → false', () => {
    expect(isNewerVersion('0.3.1', '0.3.0')).toBe(false);
  });

  it('installed same latest minor newer patch → true', () => {
    expect(isNewerVersion('0.3.0', '0.3.5')).toBe(true);
  });

  it('different major versions where latest is older → false', () => {
    expect(isNewerVersion('2.0.0', '1.0.0')).toBe(false);
  });

  it('pre-release suffix stripped, correct comparison', () => {
    // pre-release < release: installed 0.3.0-alpha, latest 0.3.0 → newer available
    expect(isNewerVersion('0.3.0-alpha', '0.3.0')).toBe(true);
    // both same pre-release
    expect(isNewerVersion('1.0.0-rc1', '1.0.0-rc1')).toBe(false);
    // different major with pre-release
    expect(isNewerVersion('1.0.0-alpha', '2.0.0')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// fetchLatestVersion — registry fetch, Ok/Err mapping
// ---------------------------------------------------------------------------

describe('fetchLatestVersion', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns Ok(version) on a successful response', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ version: '0.4.0' }),
    } as unknown as Response);

    const result = await fetchLatestVersion(new AbortController().signal);

    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap()).toBe('0.4.0');
  });

  it('returns Ok(undefined) on a non-ok response (not an error)', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: false,
      json: () => Promise.resolve({}),
    } as unknown as Response);

    const result = await fetchLatestVersion(new AbortController().signal);

    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap()).toBeUndefined();
  });

  it('returns Err on network failure', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('Network failure'));

    const result = await fetchLatestVersion(new AbortController().signal);

    expect(result.isErr()).toBe(true);
  });

  it('returns Err on AbortError (timeout)', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(
      new DOMException('The operation was aborted', 'AbortError')
    );

    const result = await fetchLatestVersion(new AbortController().signal);

    expect(result.isErr()).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// notifyUpdate — registry fetch, version check, output
// ---------------------------------------------------------------------------

describe('notifyUpdate', () => {
  const ORIGINAL_VERSION = '0.3.1';

  afterEach(() => {
    vi.restoreAllMocks();
  });

  /**
   * Mock global fetch to return a JSON response with the given version.
   */
  function mockFetch(version: string) {
    const mockJson = vi.fn().mockResolvedValue({ version });
    const mockRes = { ok: true, json: mockJson };
    return vi.spyOn(globalThis, 'fetch').mockResolvedValue(mockRes as unknown as Response);
  }

  /**
   * Mock fetch to reject (simulate network failure).
   */
  function mockFetchReject() {
    return vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('Network failure'));
  }

  /**
   * Mock fetch to return a non-ok response.
   */
  function mockFetchNonOk() {
    const mockJson = vi.fn().mockResolvedValue({});
    const mockRes = { ok: false, json: mockJson };
    return vi.spyOn(globalThis, 'fetch').mockResolvedValue(mockRes as unknown as Response);
  }

  /**
   * Mock fetch to reject with an AbortError (simulate timeout).
   */
  function mockFetchTimeout() {
    const abortError = new DOMException('The operation was aborted', 'AbortError');
    return vi.spyOn(globalThis, 'fetch').mockRejectedValue(abortError);
  }

  /**
   * Mock fetch to resolve with ok:true but no version field.
   */
  function mockFetchNoVersion() {
    const mockJson = vi.fn().mockResolvedValue({});
    const mockRes = { ok: true, json: mockJson };
    return vi.spyOn(globalThis, 'fetch').mockResolvedValue(mockRes as unknown as Response);
  }

  it('prints notice when newer version available', async () => {
    const { notifyUpdate } = await import('../check-version.js');
    mockFetch('0.4.0');

    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    await notifyUpdate();

    expect(consoleSpy).toHaveBeenCalledOnce();
    expect(consoleSpy.mock.calls[0][0]).toContain('0.3.1 → 0.4.0');

    consoleSpy.mockRestore();
  });

  it('does not print notice when installed version is already latest', async () => {
    const { notifyUpdate } = await import('../check-version.js');
    mockFetch(ORIGINAL_VERSION);

    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    await notifyUpdate();

    expect(consoleSpy).not.toHaveBeenCalled();

    consoleSpy.mockRestore();
  });

  it('does not print notice on registry fetch failure', async () => {
    const { notifyUpdate } = await import('../check-version.js');
    mockFetchReject();

    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    // Should not throw
    await expect(notifyUpdate()).resolves.toBeUndefined();
    expect(consoleSpy).not.toHaveBeenCalled();

    consoleSpy.mockRestore();
  });

  it('does not print notice on non-ok response', async () => {
    const { notifyUpdate } = await import('../check-version.js');
    mockFetchNonOk();

    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    await expect(notifyUpdate()).resolves.toBeUndefined();
    expect(consoleSpy).not.toHaveBeenCalled();

    consoleSpy.mockRestore();
  });

  it('does not print notice on fetch timeout (AbortError)', async () => {
    const { notifyUpdate } = await import('../check-version.js');
    mockFetchTimeout();

    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    await expect(notifyUpdate()).resolves.toBeUndefined();
    expect(consoleSpy).not.toHaveBeenCalled();

    consoleSpy.mockRestore();
  });

  it('does not print notice when ok response lacks version field', async () => {
    const { notifyUpdate } = await import('../check-version.js');
    mockFetchNoVersion();

    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    await expect(notifyUpdate()).resolves.toBeUndefined();
    expect(consoleSpy).not.toHaveBeenCalled();

    consoleSpy.mockRestore();
  });

  it('does not print notice in --plain mode when newer version available', async () => {
    const { notifyUpdate } = await import('../check-version.js');
    mockFetch('0.4.0');

    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    await notifyUpdate({ plain: true });

    expect(consoleSpy).not.toHaveBeenCalled();

    consoleSpy.mockRestore();
  });

  it('calls fetch on every invocation (no caching)', async () => {
    const { notifyUpdate } = await import('../check-version.js');
    const fetchSpy = mockFetch('0.4.0');

    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    await notifyUpdate();
    await notifyUpdate();

    expect(fetchSpy).toHaveBeenCalledTimes(2);

    consoleSpy.mockRestore();
  });
});
