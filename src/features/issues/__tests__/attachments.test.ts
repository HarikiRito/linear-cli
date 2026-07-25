import { ok } from 'neverthrow';
import { afterEach, describe, expect, it, vi } from 'vitest';

function makeAttachmentsResponse(nodes: { id: string; title: string; url: string }[]) {
  return {
    issue: {
      id: 'issue-uuid',
      attachments: { nodes },
    },
  };
}

function makeAttachmentResponse(attachment: {
  id: string;
  title: string;
  url: string;
  issueId: string;
}) {
  return {
    attachment: {
      id: attachment.id,
      title: attachment.title,
      url: attachment.url,
      issue: { id: attachment.issueId },
    },
  };
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.clearAllMocks();
  vi.resetModules();
  process.exitCode = undefined;
});

describe('listAttachments', () => {
  it('renders rows for each attachment', async () => {
    const requestFn = vi.fn().mockResolvedValue(
      makeAttachmentsResponse([
        {
          id: 'att-1',
          title: 'screenshot.png',
          url: 'https://uploads.linear.app/screenshot.png',
        },
      ])
    );
    const capturedRows: string[][] = [];

    vi.doMock('../../../lib/client/index.js', () => ({
      getClientWithAuthRetry: vi.fn().mockReturnValue(ok({})),
      getRequestFn: vi.fn().mockReturnValue(requestFn),
    }));
    vi.doMock('../../../lib/output/table.js', () => ({
      prettyTable: vi.fn().mockImplementation((_h: string[], rows: string[][]) => {
        capturedRows.push(...rows);
        return '';
      }),
      printTable: vi.fn(),
    }));
    vi.doMock('../../../lib/runner.js', () => ({ exitError: vi.fn() }));

    const { listAttachments } = await import('../attachments/list.js');
    await listAttachments({ issue: 'ENG-1', plain: false });

    expect(requestFn).toHaveBeenCalledWith(expect.anything(), { id: 'ENG-1' });
    const flat = capturedRows.flat();
    expect(flat).toContain('att-1');
    expect(flat).toContain('screenshot.png');
    expect(flat).toContain('https://uploads.linear.app/screenshot.png');
  });

  it('shows empty state message when the issue has no attachments', async () => {
    const requestFn = vi.fn().mockResolvedValue(makeAttachmentsResponse([]));
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    vi.doMock('../../../lib/client/index.js', () => ({
      getClientWithAuthRetry: vi.fn().mockReturnValue(ok({})),
      getRequestFn: vi.fn().mockReturnValue(requestFn),
    }));
    vi.doMock('../../../lib/output/table.js', () => ({
      prettyTable: vi.fn().mockReturnValue(''),
      printTable: vi.fn(),
    }));
    vi.doMock('../../../lib/runner.js', () => ({ exitError: vi.fn() }));

    const { listAttachments } = await import('../attachments/list.js');
    await listAttachments({ issue: 'ENG-1', plain: false });

    const output = consoleSpy.mock.calls.map((c) => String(c[0])).join('\n');
    expect(output).toContain('No attachments found.');
  });

  it('reports a NotFoundError when the issue does not exist', async () => {
    const requestFn = vi.fn().mockResolvedValue({ issue: null });
    const exitErrorFn = vi.fn();

    vi.doMock('../../../lib/client/index.js', () => ({
      getClientWithAuthRetry: vi.fn().mockReturnValue(ok({})),
      getRequestFn: vi.fn().mockReturnValue(requestFn),
    }));
    vi.doMock('../../../lib/runner.js', () => ({ exitError: exitErrorFn }));

    const { listAttachments } = await import('../attachments/list.js');
    await listAttachments({ issue: 'ENG-999', plain: false });

    expect(exitErrorFn).toHaveBeenCalledWith(
      expect.objectContaining({ message: expect.stringContaining('not found') })
    );
  });
});

describe('downloadAttachment', () => {
  const attachment = {
    id: 'att-1',
    title: 'notes.txt',
    url: 'https://uploads.linear.app/notes.txt',
  };

  it('downloads the matching attachment and writes it to the derived filename', async () => {
    const requestFn = vi
      .fn()
      .mockResolvedValue(makeAttachmentResponse({ ...attachment, issueId: 'ENG-1' }));
    const writeFileSyncFn = vi.fn();
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      statusText: 'OK',
      arrayBuffer: () => Promise.resolve(new TextEncoder().encode('hello world').buffer),
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
    vi.doMock('node:fs', () => ({ writeFileSync: writeFileSyncFn }));

    const { downloadAttachment } = await import('../attachments/download.js');
    await downloadAttachment({ issue: 'ENG-1', attachmentId: 'att-1' });

    expect(fetchMock).toHaveBeenCalledWith(
      'https://uploads.linear.app/notes.txt',
      expect.objectContaining({ headers: { Authorization: 'lin_api_key' } })
    );
    expect(writeFileSyncFn).toHaveBeenCalledWith('notes.txt', expect.any(Buffer));
  });

  it('sends a Bearer-prefixed Authorization header for an OAuth access token', async () => {
    const requestFn = vi
      .fn()
      .mockResolvedValue(makeAttachmentResponse({ ...attachment, issueId: 'ENG-1' }));
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
      resolveCredential: vi.fn().mockReturnValue(ok({ type: 'accessToken', value: 'oauth-token' })),
    }));
    vi.doMock('../../../lib/runner.js', () => ({ exitError: vi.fn() }));
    vi.doMock('node:fs', () => ({ writeFileSync: vi.fn() }));

    const { downloadAttachment } = await import('../attachments/download.js');
    await downloadAttachment({ issue: 'ENG-1', attachmentId: 'att-1', output: '/tmp/notes.txt' });

    expect(fetchMock).toHaveBeenCalledWith(
      'https://uploads.linear.app/notes.txt',
      expect.objectContaining({ headers: { Authorization: 'Bearer oauth-token' } })
    );
  });

  it('reports a NotFoundError when the attachment ID does not exist', async () => {
    const requestFn = vi.fn().mockResolvedValue({ attachment: null });
    const exitErrorFn = vi.fn();
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    vi.doMock('../../../lib/client/index.js', () => ({
      getClientWithAuthRetry: vi.fn().mockReturnValue(ok({})),
      getRequestFn: vi.fn().mockReturnValue(requestFn),
    }));
    vi.doMock('../../auth/resolve.js', () => ({
      resolveCredential: vi.fn().mockReturnValue(ok({ type: 'apiKey', value: 'lin_api_key' })),
    }));
    vi.doMock('../../../lib/runner.js', () => ({ exitError: exitErrorFn }));
    vi.doMock('node:fs', () => ({ writeFileSync: vi.fn() }));

    const { downloadAttachment } = await import('../attachments/download.js');
    await downloadAttachment({ issue: 'ENG-1', attachmentId: 'does-not-exist' });

    expect(requestFn).toHaveBeenCalledWith(expect.anything(), { id: 'does-not-exist' });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(exitErrorFn).toHaveBeenCalledWith(
      expect.objectContaining({ message: expect.stringContaining("'does-not-exist' not found") })
    );
  });

  it('reports a NotFoundError when the attachment belongs to a different issue (IDOR guard)', async () => {
    const requestFn = vi
      .fn()
      .mockResolvedValue(makeAttachmentResponse({ ...attachment, issueId: 'other-issue-uuid' }));
    const exitErrorFn = vi.fn();
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    vi.doMock('../../../lib/client/index.js', () => ({
      getClientWithAuthRetry: vi.fn().mockReturnValue(ok({})),
      getRequestFn: vi.fn().mockReturnValue(requestFn),
    }));
    vi.doMock('../../auth/resolve.js', () => ({
      resolveCredential: vi.fn().mockReturnValue(ok({ type: 'apiKey', value: 'lin_api_key' })),
    }));
    vi.doMock('../../../lib/runner.js', () => ({ exitError: exitErrorFn }));
    vi.doMock('node:fs', () => ({ writeFileSync: vi.fn() }));

    const { downloadAttachment } = await import('../attachments/download.js');
    // attachment.id belongs to a different issue than the one requested — must
    // not leak its title/url just because the global attachment ID is valid.
    await downloadAttachment({ issue: 'ENG-1', attachmentId: attachment.id });

    expect(fetchMock).not.toHaveBeenCalled();
    expect(exitErrorFn).toHaveBeenCalledWith(
      expect.objectContaining({ message: expect.stringContaining(`'${attachment.id}' not found`) })
    );
  });

  it('reports an error when the asset GET returns a non-2xx response', async () => {
    const requestFn = vi
      .fn()
      .mockResolvedValue(makeAttachmentResponse({ ...attachment, issueId: 'ENG-1' }));
    const exitErrorFn = vi.fn();
    const writeFileSyncFn = vi.fn();
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 403,
      statusText: 'Forbidden',
    });
    vi.stubGlobal('fetch', fetchMock);

    vi.doMock('../../../lib/client/index.js', () => ({
      getClientWithAuthRetry: vi.fn().mockReturnValue(ok({})),
      getRequestFn: vi.fn().mockReturnValue(requestFn),
    }));
    vi.doMock('../../auth/resolve.js', () => ({
      resolveCredential: vi.fn().mockReturnValue(ok({ type: 'apiKey', value: 'lin_api_key' })),
    }));
    vi.doMock('../../../lib/runner.js', () => ({ exitError: exitErrorFn }));
    vi.doMock('node:fs', () => ({ writeFileSync: writeFileSyncFn }));

    const { downloadAttachment } = await import('../attachments/download.js');
    await downloadAttachment({ issue: 'ENG-1', attachmentId: 'att-1' });

    expect(exitErrorFn).toHaveBeenCalledWith(
      expect.objectContaining({
        message: expect.stringContaining('Attachment download failed (403): Forbidden'),
      })
    );
    expect(writeFileSyncFn).not.toHaveBeenCalled();
  });
});
