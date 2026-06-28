import { ok } from 'neverthrow';
import { afterEach, describe, expect, it, vi } from 'vitest';

afterEach(() => {
  vi.restoreAllMocks();
  vi.clearAllMocks();
  vi.resetModules();
  process.exitCode = undefined;
});

describe('linkAttachment', () => {
  it('calls attachmentLinkURL with resolved issue ID and URL', async () => {
    const attachmentMock = { id: 'att-uuid' };
    const payloadMock = {
      get attachment() { return Promise.resolve(attachmentMock); },
    };
    const attachmentLinkURLFn = vi.fn().mockResolvedValue(payloadMock);
    vi.doMock('../../../lib/client/index.js', () => ({
      getClientWithAuthRetry: vi.fn().mockReturnValue(ok({ attachmentLinkURL: attachmentLinkURLFn })),
      getRequestFn: vi.fn(),
    }));
    vi.doMock('../../../lib/runner.js', () => ({ exitError: vi.fn() }));

    const { linkAttachment } = await import('../link/link.js');
    await linkAttachment({ issue: 'ENG-1', url: 'https://example.com' });

    expect(attachmentLinkURLFn).toHaveBeenCalledWith('ENG-1', 'https://example.com', undefined);
  });

  it('passes title option when --title provided', async () => {
    const payloadMock = {
      get attachment() { return Promise.resolve({ id: 'att-uuid' }); },
    };
    const attachmentLinkURLFn = vi.fn().mockResolvedValue(payloadMock);
    vi.doMock('../../../lib/client/index.js', () => ({
      getClientWithAuthRetry: vi.fn().mockReturnValue(ok({ attachmentLinkURL: attachmentLinkURLFn })),
      getRequestFn: vi.fn(),
    }));
    vi.doMock('../../../lib/runner.js', () => ({ exitError: vi.fn() }));

    const { linkAttachment } = await import('../link/link.js');
    await linkAttachment({ issue: 'ENG-1', url: 'https://example.com', title: 'My Spec' });

    expect(attachmentLinkURLFn).toHaveBeenCalledWith(
      'ENG-1',
      'https://example.com',
      { title: 'My Spec' }
    );
  });
});

describe('unlinkAttachment', () => {
  it('calls deleteAttachment with the provided attachment ID', async () => {
    const deleteAttachmentFn = vi.fn().mockResolvedValue({ success: true });
    vi.doMock('../../../lib/client/index.js', () => ({
      getClientWithAuthRetry: vi.fn().mockReturnValue(ok({ deleteAttachment: deleteAttachmentFn })),
      getRequestFn: vi.fn(),
    }));
    vi.doMock('../../../lib/runner.js', () => ({ exitError: vi.fn() }));

    const { unlinkAttachment } = await import('../link/link.js');
    await unlinkAttachment({ attachmentId: 'att-abc-123' });

    expect(deleteAttachmentFn).toHaveBeenCalledWith('att-abc-123');
  });
});
