import { ok } from 'neverthrow';
import { afterEach, describe, expect, it, vi } from 'vitest';

afterEach(() => {
  vi.restoreAllMocks();
  vi.clearAllMocks();
  vi.resetModules();
  process.exitCode = undefined;
});

function mockClient(overrides?: Record<string, unknown>) {
  return {
    fileUpload: vi.fn(),
    createAttachment: vi.fn(),
    createComment: vi.fn(),
    updateComment: vi.fn(),
    ...overrides,
  };
}

describe('attachFile', () => {
  it('uploads file and creates attachment with correct assetUrl and issue ID', async () => {
    const attachmentMock = { id: 'att-uuid' };
    const payloadMock = {
      get attachment() {
        return Promise.resolve(attachmentMock);
      },
    };
    const createAttachmentFn = vi.fn().mockResolvedValue(payloadMock);

    vi.doMock('../../../lib/client/index.js', () => ({
      getClientWithAuthRetry: vi
        .fn()
        .mockReturnValue(ok(mockClient({ createAttachment: createAttachmentFn }))),
      getRequestFn: vi.fn(),
    }));
    vi.doMock('../../../lib/runner.js', () => ({ exitError: vi.fn() }));
    vi.doMock('../../../lib/upload.js', () => ({
      uploadFile: vi.fn().mockResolvedValue(
        ok({
          assetUrl: 'https://storage.linear.app/uploads/file.png',
          uploadUrl: 'https://storage.googleapis.com/upload-url',
          filename: 'file.png',
        })
      ),
    }));

    const { attachFile } = await import('../upload/upload.js');
    await attachFile({ issue: 'ENG-1', file: '/tmp/test.png' });

    expect(createAttachmentFn).toHaveBeenCalledWith({
      issueId: 'ENG-1',
      title: 'file.png',
      url: 'https://storage.linear.app/uploads/file.png',
    });
  });

  it('reports error for non-existent local path and makes no API calls', async () => {
    const exitErrorFn = vi.fn();

    vi.doMock('../../../lib/client/index.js', () => ({
      getClientWithAuthRetry: vi.fn().mockReturnValue(ok(mockClient())),
      getRequestFn: vi.fn(),
    }));
    vi.doMock('../../../lib/runner.js', () => ({ exitError: exitErrorFn }));
    vi.doMock('../../../lib/upload.js', () => ({
      uploadFile: vi.fn().mockResolvedValue({
        isErr: () => true,
        error: new Error('File not found: /nonexistent/path'),
      }),
    }));

    const { attachFile } = await import('../upload/upload.js');
    await attachFile({ issue: 'ENG-1', file: '/nonexistent/path' });

    expect(exitErrorFn).toHaveBeenCalledWith(
      expect.objectContaining({ message: expect.stringContaining('File not found') })
    );
  });

  it('surfaces fileUpload mutation failure without calling attachmentCreate', async () => {
    const exitErrorFn = vi.fn();
    const createAttachmentFn = vi.fn();

    vi.doMock('../../../lib/client/index.js', () => ({
      getClientWithAuthRetry: vi
        .fn()
        .mockReturnValue(ok(mockClient({ createAttachment: createAttachmentFn }))),
      getRequestFn: vi.fn(),
    }));
    vi.doMock('../../../lib/runner.js', () => ({ exitError: exitErrorFn }));
    vi.doMock('../../../lib/upload.js', () => ({
      uploadFile: vi
        .fn()
        .mockResolvedValue({ isErr: () => true, error: new Error('fileUpload mutation failed') }),
    }));

    const { attachFile } = await import('../upload/upload.js');
    await attachFile({ issue: 'ENG-1', file: '/tmp/test.png' });

    expect(exitErrorFn).toHaveBeenCalledWith(
      expect.objectContaining({ message: expect.stringContaining('fileUpload') })
    );
    expect(createAttachmentFn).not.toHaveBeenCalled();
  });

  it('surfaces distinct upload-failure error when PUT returns non-2xx', async () => {
    const exitErrorFn = vi.fn();
    const createAttachmentFn = vi.fn();

    vi.doMock('../../../lib/client/index.js', () => ({
      getClientWithAuthRetry: vi
        .fn()
        .mockReturnValue(ok(mockClient({ createAttachment: createAttachmentFn }))),
      getRequestFn: vi.fn(),
    }));
    vi.doMock('../../../lib/runner.js', () => ({ exitError: exitErrorFn }));
    vi.doMock('../../../lib/upload.js', () => ({
      uploadFile: vi.fn().mockResolvedValue({
        isErr: () => true,
        error: new (class extends Error {
          readonly kind = 'UploadError';
          constructor() {
            super('File upload to storage failed (403): Forbidden');
            this.name = 'UploadError';
          }
        })(),
      }),
    }));

    const { attachFile } = await import('../upload/upload.js');
    await attachFile({ issue: 'ENG-1', file: '/tmp/test.png' });

    expect(exitErrorFn).toHaveBeenCalledWith(
      expect.objectContaining({ message: expect.stringContaining('File upload to storage failed') })
    );
    expect(createAttachmentFn).not.toHaveBeenCalled();
  });
});

describe('addComment with --file', () => {
  it('uploads file and creates comment body with markdown image for png', async () => {
    const commentResult = {
      id: 'cmt-uuid',
      body: '![file.png](https://storage.linear.app/uploads/file.png)',
      url: 'https://linear.app/issue/ENG-1#comment-cmt-uuid',
      createdAt: new Date().toISOString(),
      author: 'Test User',
    };
    const payloadMock = {
      get comment() {
        return Promise.resolve({
          id: commentResult.id,
          body: commentResult.body,
          url: commentResult.url,
          createdAt: new Date(commentResult.createdAt),
          get user() {
            return Promise.resolve({ name: commentResult.author });
          },
        });
      },
    };
    const createCommentFn = vi.fn().mockResolvedValue(payloadMock);

    vi.doMock('../../../lib/client/index.js', () => ({
      getClientWithAuthRetry: vi
        .fn()
        .mockReturnValue(ok(mockClient({ createComment: createCommentFn }))),
      getRequestFn: vi.fn(),
    }));
    vi.doMock('../../../lib/runner.js', () => ({ exitError: vi.fn() }));
    vi.doMock('../../../lib/upload.js', () => ({
      uploadFile: vi.fn().mockResolvedValue(
        ok({
          assetUrl: 'https://storage.linear.app/uploads/file.png',
          uploadUrl: 'https://storage.googleapis.com/upload-url',
          filename: 'file.png',
        })
      ),
      embedMarkdown: vi.fn((r: { assetUrl: string; filename: string }) =>
        /\.(png|jpg|jpeg|gif|webp|svg)$/i.test(r.filename)
          ? `![${r.filename}](${r.assetUrl})`
          : `[${r.filename}](${r.assetUrl})`
      ),
    }));

    const { addComment } = await import('../comment/add.js');
    await addComment({
      issueId: 'ENG-1',
      body: '',
      plain: false,
      file: '/tmp/file.png',
    });

    expect(createCommentFn).toHaveBeenCalledWith({
      issueId: 'ENG-1',
      body: '![file.png](https://storage.linear.app/uploads/file.png)',
    });
  });

  it('appends markdown link for non-image files to existing body', async () => {
    const payloadMock = {
      get comment() {
        return Promise.resolve({
          id: 'cmt-uuid',
          body: 'Some text\n\n[file.pdf](https://storage.linear.app/uploads/file.pdf)',
          url: '',
          createdAt: new Date('2024-01-01'),
          get user() {
            return Promise.resolve({ name: 'Tester' });
          },
        });
      },
    };
    const createCommentFn = vi.fn().mockResolvedValue(payloadMock);

    vi.doMock('../../../lib/client/index.js', () => ({
      getClientWithAuthRetry: vi
        .fn()
        .mockReturnValue(ok(mockClient({ createComment: createCommentFn }))),
      getRequestFn: vi.fn(),
    }));
    vi.doMock('../../../lib/runner.js', () => ({ exitError: vi.fn() }));
    vi.doMock('../../../lib/upload.js', () => ({
      uploadFile: vi.fn().mockResolvedValue(
        ok({
          assetUrl: 'https://storage.linear.app/uploads/file.pdf',
          uploadUrl: 'https://storage.googleapis.com/upload-url',
          filename: 'file.pdf',
        })
      ),
      embedMarkdown: vi.fn((r: { assetUrl: string; filename: string }) =>
        /\.(png|jpg|jpeg|gif|webp|svg)$/i.test(r.filename)
          ? `![${r.filename}](${r.assetUrl})`
          : `[${r.filename}](${r.assetUrl})`
      ),
    }));

    const { addComment } = await import('../comment/add.js');
    await addComment({
      issueId: 'ENG-1',
      body: 'Some text',
      plain: false,
      file: '/tmp/file.pdf',
    });

    expect(createCommentFn).toHaveBeenCalledWith({
      issueId: 'ENG-1',
      body: 'Some text\n\n[file.pdf](https://storage.linear.app/uploads/file.pdf)',
    });
  });
});

describe('updateComment with --file', () => {
  it('uploads file and updates comment body with markdown link', async () => {
    const commentResult = {
      id: 'cmt-uuid',
      body: 'Updated text\n\n[file.pdf](https://storage.linear.app/uploads/file.pdf)',
      url: '',
      createdAt: new Date().toISOString(),
      author: 'Test User',
    };
    const payloadMock = {
      get comment() {
        return Promise.resolve({
          id: commentResult.id,
          body: commentResult.body,
          url: commentResult.url,
          createdAt: new Date(commentResult.createdAt),
          get user() {
            return Promise.resolve({ name: commentResult.author });
          },
        });
      },
    };
    const updateCommentFn = vi.fn().mockResolvedValue(payloadMock);

    vi.doMock('../../../lib/client/index.js', () => ({
      getClientWithAuthRetry: vi
        .fn()
        .mockReturnValue(ok(mockClient({ updateComment: updateCommentFn }))),
      getRequestFn: vi.fn(),
    }));
    vi.doMock('../../../lib/runner.js', () => ({ exitError: vi.fn() }));
    vi.doMock('../../../lib/upload.js', () => ({
      uploadFile: vi.fn().mockResolvedValue(
        ok({
          assetUrl: 'https://storage.linear.app/uploads/file.pdf',
          uploadUrl: 'https://storage.googleapis.com/upload-url',
          filename: 'file.pdf',
        })
      ),
      embedMarkdown: vi.fn((r: { assetUrl: string; filename: string }) =>
        /\.(png|jpg|jpeg|gif|webp|svg)$/i.test(r.filename)
          ? `![${r.filename}](${r.assetUrl})`
          : `[${r.filename}](${r.assetUrl})`
      ),
    }));

    const { updateComment } = await import('../comment/update.js');
    await updateComment({
      id: 'cmt-uuid',
      body: 'Updated text',
      plain: false,
      file: '/tmp/file.pdf',
    });

    expect(updateCommentFn).toHaveBeenCalledWith('cmt-uuid', {
      body: 'Updated text\n\n[file.pdf](https://storage.linear.app/uploads/file.pdf)',
    });
  });
});
