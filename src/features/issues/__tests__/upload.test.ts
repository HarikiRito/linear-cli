import { ok } from 'neverthrow';
import { afterEach, describe, expect, it, vi } from 'vitest';

afterEach(() => {
  vi.restoreAllMocks();
  vi.clearAllMocks();
  vi.resetModules();
  process.exitCode = undefined;
});

function attachmentPayload(id = 'att-uuid') {
  return {
    get attachment() {
      return Promise.resolve({ id });
    },
  };
}

function mockClient(overrides?: Record<string, unknown>) {
  return {
    fileUpload: vi.fn(),
    createAttachment: vi.fn().mockResolvedValue(attachmentPayload()),
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
    vi.doMock('../../../lib/upload.js', async (importOriginal) => {
      const actual = await importOriginal<typeof import('../../../lib/upload.js')>();
      return {
        ...actual,
        uploadFile: vi.fn().mockResolvedValue(
          ok({
            assetUrl: 'https://storage.linear.app/uploads/file.png',
            uploadUrl: 'https://storage.googleapis.com/upload-url',
            filename: 'file.png',
          })
        ),
      };
    });

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
    vi.doMock('../../../lib/upload.js', async (importOriginal) => {
      const actual = await importOriginal<typeof import('../../../lib/upload.js')>();
      return {
        ...actual,
        uploadFile: vi.fn().mockResolvedValue({
          isErr: () => true,
          error: new Error('File not found: /nonexistent/path'),
        }),
      };
    });

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
    vi.doMock('../../../lib/upload.js', async (importOriginal) => {
      const actual = await importOriginal<typeof import('../../../lib/upload.js')>();
      return {
        ...actual,
        uploadFile: vi
          .fn()
          .mockResolvedValue({ isErr: () => true, error: new Error('fileUpload mutation failed') }),
      };
    });

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
    vi.doMock('../../../lib/upload.js', async (importOriginal) => {
      const actual = await importOriginal<typeof import('../../../lib/upload.js')>();
      return {
        ...actual,
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
      };
    });

    const { attachFile } = await import('../upload/upload.js');
    await attachFile({ issue: 'ENG-1', file: '/tmp/test.png' });

    expect(exitErrorFn).toHaveBeenCalledWith(
      expect.objectContaining({ message: expect.stringContaining('File upload to storage failed') })
    );
    expect(createAttachmentFn).not.toHaveBeenCalled();
  });
});

describe('addComment with --file', () => {
  it('embeds an image upload inline in the comment body and does not create an attachment', async () => {
    const payloadMock = {
      get comment() {
        return Promise.resolve({
          id: 'cmt-uuid',
          body: '![file.png](https://storage.linear.app/uploads/file.png)',
          url: '',
          createdAt: new Date('2024-01-01'),
          get user() {
            return Promise.resolve({ name: 'Tester' });
          },
        });
      },
    };
    const createCommentFn = vi.fn().mockResolvedValue(payloadMock);
    const createAttachmentFn = vi.fn().mockResolvedValue(attachmentPayload());

    vi.doMock('../../../lib/client/index.js', () => ({
      getClientWithAuthRetry: vi
        .fn()
        .mockReturnValue(
          ok(mockClient({ createComment: createCommentFn, createAttachment: createAttachmentFn }))
        ),
      getRequestFn: vi.fn(),
    }));
    vi.doMock('../../../lib/runner.js', () => ({ exitError: vi.fn() }));
    vi.doMock('../../../lib/upload.js', async (importOriginal) => {
      const actual = await importOriginal<typeof import('../../../lib/upload.js')>();
      return {
        ...actual,
        uploadAndClassify: vi.fn().mockResolvedValue(
          ok({
            uploaded: {
              assetUrl: 'https://storage.linear.app/uploads/file.png',
              uploadUrl: 'https://storage.googleapis.com/upload-url',
              filename: 'file.png',
            },
            isImage: true,
            embedMarkdown: '![file.png](https://storage.linear.app/uploads/file.png)',
          })
        ),
      };
    });

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
    expect(createAttachmentFn).not.toHaveBeenCalled();
  });

  it('leaves the comment body untouched for a non-image upload and registers a resource-tab attachment', async () => {
    const payloadMock = {
      get comment() {
        return Promise.resolve({
          id: 'cmt-uuid',
          body: 'Some text',
          url: '',
          createdAt: new Date('2024-01-01'),
          get user() {
            return Promise.resolve({ name: 'Tester' });
          },
        });
      },
    };
    const createCommentFn = vi.fn().mockResolvedValue(payloadMock);
    const createAttachmentFn = vi.fn().mockResolvedValue(attachmentPayload('att-uuid'));

    vi.doMock('../../../lib/client/index.js', () => ({
      getClientWithAuthRetry: vi
        .fn()
        .mockReturnValue(
          ok(mockClient({ createComment: createCommentFn, createAttachment: createAttachmentFn }))
        ),
      getRequestFn: vi.fn(),
    }));
    vi.doMock('../../../lib/runner.js', () => ({ exitError: vi.fn() }));
    vi.doMock('../../../lib/upload.js', async (importOriginal) => {
      const actual = await importOriginal<typeof import('../../../lib/upload.js')>();
      return {
        ...actual,
        uploadAndClassify: vi.fn().mockResolvedValue(
          ok({
            uploaded: {
              assetUrl: 'https://storage.linear.app/uploads/file.pdf',
              uploadUrl: 'https://storage.googleapis.com/upload-url',
              filename: 'file.pdf',
            },
            isImage: false,
            embedMarkdown: '',
          })
        ),
      };
    });

    const { addComment } = await import('../comment/add.js');
    await addComment({
      issueId: 'ENG-1',
      body: 'Some text',
      plain: false,
      file: '/tmp/file.pdf',
    });

    // Body passed through unchanged — no markdown link inserted for non-image uploads.
    expect(createCommentFn).toHaveBeenCalledWith({
      issueId: 'ENG-1',
      body: 'Some text',
    });
    expect(createAttachmentFn).toHaveBeenCalledWith({
      issueId: 'ENG-1',
      title: 'file.pdf',
      url: 'https://storage.linear.app/uploads/file.pdf',
    });
  });

  it('warns but still renders the comment when attachment registration fails for a non-image upload', async () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const exitErrorFn = vi.fn();
    const payloadMock = {
      get comment() {
        return Promise.resolve({
          id: 'cmt-uuid',
          body: '',
          url: '',
          createdAt: new Date('2024-01-01'),
          get user() {
            return Promise.resolve({ name: 'Tester' });
          },
        });
      },
    };
    const createCommentFn = vi.fn().mockResolvedValue(payloadMock);
    const createAttachmentFn = vi.fn().mockRejectedValue(new Error('createAttachment failed'));

    vi.doMock('../../../lib/client/index.js', () => ({
      getClientWithAuthRetry: vi
        .fn()
        .mockReturnValue(
          ok(mockClient({ createComment: createCommentFn, createAttachment: createAttachmentFn }))
        ),
      getRequestFn: vi.fn(),
    }));
    vi.doMock('../../../lib/runner.js', () => ({ exitError: exitErrorFn }));
    vi.doMock('../../../lib/upload.js', async (importOriginal) => {
      const actual = await importOriginal<typeof import('../../../lib/upload.js')>();
      return {
        ...actual,
        uploadAndClassify: vi.fn().mockResolvedValue(
          ok({
            uploaded: {
              assetUrl: 'https://storage.linear.app/uploads/file.pdf',
              uploadUrl: 'https://storage.googleapis.com/upload-url',
              filename: 'file.pdf',
            },
            isImage: false,
            embedMarkdown: '',
          })
        ),
      };
    });

    const { addComment } = await import('../comment/add.js');
    await addComment({
      issueId: 'ENG-1',
      body: '',
      plain: true,
      file: '/tmp/file.pdf',
    });

    // Comment already posted successfully — no hard error, just a warning.
    expect(exitErrorFn).not.toHaveBeenCalled();
    expect(process.exitCode).toBeUndefined();
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      expect.stringContaining('could not register file attachment')
    );
    // Comment still rendered.
    expect(consoleLogSpy).toHaveBeenCalled();
  });
});

describe('updateComment with --file', () => {
  it('embeds an image upload inline in the comment body and does not create an attachment', async () => {
    const payloadMock = {
      get comment() {
        return Promise.resolve({
          id: 'cmt-uuid',
          body: '![file.png](https://storage.linear.app/uploads/file.png)',
          url: '',
          createdAt: new Date('2024-01-01'),
          get user() {
            return Promise.resolve({ name: 'Tester' });
          },
          get issue() {
            return Promise.resolve({ id: 'issue-uuid' });
          },
        });
      },
    };
    const updateCommentFn = vi.fn().mockResolvedValue(payloadMock);
    const createAttachmentFn = vi.fn().mockResolvedValue(attachmentPayload());

    vi.doMock('../../../lib/client/index.js', () => ({
      getClientWithAuthRetry: vi
        .fn()
        .mockReturnValue(
          ok(mockClient({ updateComment: updateCommentFn, createAttachment: createAttachmentFn }))
        ),
      getRequestFn: vi.fn(),
    }));
    vi.doMock('../../../lib/runner.js', () => ({ exitError: vi.fn() }));
    vi.doMock('../../../lib/upload.js', async (importOriginal) => {
      const actual = await importOriginal<typeof import('../../../lib/upload.js')>();
      return {
        ...actual,
        uploadAndClassify: vi.fn().mockResolvedValue(
          ok({
            uploaded: {
              assetUrl: 'https://storage.linear.app/uploads/file.png',
              uploadUrl: 'https://storage.googleapis.com/upload-url',
              filename: 'file.png',
            },
            isImage: true,
            embedMarkdown: '![file.png](https://storage.linear.app/uploads/file.png)',
          })
        ),
      };
    });

    const { updateComment } = await import('../comment/update.js');
    await updateComment({
      id: 'cmt-uuid',
      body: '',
      plain: false,
      file: '/tmp/file.png',
    });

    expect(updateCommentFn).toHaveBeenCalledWith('cmt-uuid', {
      body: '![file.png](https://storage.linear.app/uploads/file.png)',
    });
    expect(createAttachmentFn).not.toHaveBeenCalled();
  });

  it('leaves the comment body untouched for a non-image upload and registers an attachment via the resolved comment.issue', async () => {
    const payloadMock = {
      get comment() {
        return Promise.resolve({
          id: 'cmt-uuid',
          body: 'Updated text',
          url: '',
          createdAt: new Date('2024-01-01'),
          get user() {
            return Promise.resolve({ name: 'Tester' });
          },
          get issue() {
            return Promise.resolve({ id: 'issue-uuid' });
          },
        });
      },
    };
    const updateCommentFn = vi.fn().mockResolvedValue(payloadMock);
    const createAttachmentFn = vi.fn().mockResolvedValue(attachmentPayload('att-uuid'));

    vi.doMock('../../../lib/client/index.js', () => ({
      getClientWithAuthRetry: vi.fn().mockReturnValue(
        ok(
          mockClient({
            updateComment: updateCommentFn,
            createAttachment: createAttachmentFn,
          })
        )
      ),
      getRequestFn: vi.fn(),
    }));
    vi.doMock('../../../lib/runner.js', () => ({ exitError: vi.fn() }));
    vi.doMock('../../../lib/upload.js', async (importOriginal) => {
      const actual = await importOriginal<typeof import('../../../lib/upload.js')>();
      return {
        ...actual,
        uploadAndClassify: vi.fn().mockResolvedValue(
          ok({
            uploaded: {
              assetUrl: 'https://storage.linear.app/uploads/file.pdf',
              uploadUrl: 'https://storage.googleapis.com/upload-url',
              filename: 'file.pdf',
            },
            isImage: false,
            embedMarkdown: '',
          })
        ),
      };
    });

    const { updateComment } = await import('../comment/update.js');
    await updateComment({
      id: 'cmt-uuid',
      body: 'Updated text',
      plain: true,
      file: '/tmp/file.pdf',
    });

    expect(updateCommentFn).toHaveBeenCalledWith('cmt-uuid', { body: 'Updated text' });
    expect(createAttachmentFn).toHaveBeenCalledWith({
      issueId: 'issue-uuid',
      title: 'file.pdf',
      url: 'https://storage.linear.app/uploads/file.pdf',
    });
    expect(process.exitCode).toBeUndefined();
  });

  it('warns but still renders the comment when attachment registration fails for a non-image upload', async () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const exitErrorFn = vi.fn();
    const payloadMock = {
      get comment() {
        return Promise.resolve({
          id: 'cmt-uuid',
          body: 'Updated text',
          url: '',
          createdAt: new Date('2024-01-01'),
          get user() {
            return Promise.resolve({ name: 'Tester' });
          },
          get issue() {
            return Promise.resolve({ id: 'issue-uuid' });
          },
        });
      },
    };
    const updateCommentFn = vi.fn().mockResolvedValue(payloadMock);
    const createAttachmentFn = vi.fn().mockRejectedValue(new Error('createAttachment failed'));

    vi.doMock('../../../lib/client/index.js', () => ({
      getClientWithAuthRetry: vi.fn().mockReturnValue(
        ok(
          mockClient({
            updateComment: updateCommentFn,
            createAttachment: createAttachmentFn,
          })
        )
      ),
      getRequestFn: vi.fn(),
    }));
    vi.doMock('../../../lib/runner.js', () => ({ exitError: exitErrorFn }));
    vi.doMock('../../../lib/upload.js', async (importOriginal) => {
      const actual = await importOriginal<typeof import('../../../lib/upload.js')>();
      return {
        ...actual,
        uploadAndClassify: vi.fn().mockResolvedValue(
          ok({
            uploaded: {
              assetUrl: 'https://storage.linear.app/uploads/file.pdf',
              uploadUrl: 'https://storage.googleapis.com/upload-url',
              filename: 'file.pdf',
            },
            isImage: false,
            embedMarkdown: '',
          })
        ),
      };
    });

    const { updateComment } = await import('../comment/update.js');
    await updateComment({
      id: 'cmt-uuid',
      body: 'Updated text',
      plain: true,
      file: '/tmp/file.pdf',
    });

    // Comment already updated successfully — no hard error, just a warning.
    expect(exitErrorFn).not.toHaveBeenCalled();
    expect(process.exitCode).toBeUndefined();
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      expect.stringContaining('could not register file attachment')
    );
    // Comment still rendered.
    expect(consoleLogSpy).toHaveBeenCalled();
  });

  it('warns and skips attachment registration when comment.issue resolves to undefined', async () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const exitErrorFn = vi.fn();
    const createAttachmentFn = vi.fn();
    const payloadMock = {
      get comment() {
        return Promise.resolve({
          id: 'cmt-uuid',
          body: 'Updated text',
          url: '',
          createdAt: new Date('2024-01-01'),
          get user() {
            return Promise.resolve({ name: 'Tester' });
          },
          get issue() {
            return Promise.resolve(undefined);
          },
        });
      },
    };
    const updateCommentFn = vi.fn().mockResolvedValue(payloadMock);

    vi.doMock('../../../lib/client/index.js', () => ({
      getClientWithAuthRetry: vi.fn().mockReturnValue(
        ok(
          mockClient({
            updateComment: updateCommentFn,
            createAttachment: createAttachmentFn,
          })
        )
      ),
      getRequestFn: vi.fn(),
    }));
    vi.doMock('../../../lib/runner.js', () => ({ exitError: exitErrorFn }));
    vi.doMock('../../../lib/upload.js', async (importOriginal) => {
      const actual = await importOriginal<typeof import('../../../lib/upload.js')>();
      return {
        ...actual,
        uploadAndClassify: vi.fn().mockResolvedValue(
          ok({
            uploaded: {
              assetUrl: 'https://storage.linear.app/uploads/file.pdf',
              uploadUrl: 'https://storage.googleapis.com/upload-url',
              filename: 'file.pdf',
            },
            isImage: false,
            embedMarkdown: '',
          })
        ),
      };
    });

    const { updateComment } = await import('../comment/update.js');
    await updateComment({
      id: 'cmt-uuid',
      body: 'Updated text',
      plain: true,
      file: '/tmp/file.pdf',
    });

    expect(createAttachmentFn).not.toHaveBeenCalled();
    expect(exitErrorFn).not.toHaveBeenCalled();
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      expect.stringContaining('could not resolve issue for comment')
    );
  });
});

describe('createIssue with --file', () => {
  const baseOpts = {
    title: 'New issue',
    team: '11111111-1111-1111-1111-111111111111',
    plain: true,
  };

  function issuePayload() {
    return {
      get issue() {
        return Promise.resolve({
          id: 'issue-uuid',
          identifier: 'ENG-1',
          title: 'New issue',
          url: 'https://linear.app/issue/ENG-1',
          get state() {
            return Promise.resolve({ name: 'Todo' });
          },
        });
      },
    };
  }

  it('embeds an image upload inline in the description before creating, and does not attach', async () => {
    const createIssueFn = vi.fn().mockResolvedValue(issuePayload());
    const createAttachmentFn = vi.fn().mockResolvedValue(attachmentPayload());

    vi.doMock('../../../lib/client/index.js', () => ({
      getClientWithAuthRetry: vi
        .fn()
        .mockReturnValue(
          ok(mockClient({ createIssue: createIssueFn, createAttachment: createAttachmentFn }))
        ),
      getRequestFn: vi.fn(),
    }));
    vi.doMock('../../../lib/runner.js', () => ({ exitError: vi.fn() }));
    vi.doMock('../../../lib/upload.js', async (importOriginal) => {
      const actual = await importOriginal<typeof import('../../../lib/upload.js')>();
      return {
        ...actual,
        uploadAndClassify: vi.fn().mockResolvedValue(
          ok({
            uploaded: {
              assetUrl: 'https://storage.linear.app/uploads/file.png',
              uploadUrl: 'https://storage.googleapis.com/upload-url',
              filename: 'file.png',
            },
            isImage: true,
            embedMarkdown: '![file.png](https://storage.linear.app/uploads/file.png)',
          })
        ),
      };
    });

    const { createIssue } = await import('../create/create.js');
    await createIssue({
      ...baseOpts,
      description: 'Existing description',
      file: '/tmp/file.png',
    });

    expect(createIssueFn).toHaveBeenCalledWith(
      expect.objectContaining({
        description:
          'Existing description\n\n![file.png](https://storage.linear.app/uploads/file.png)',
      })
    );
    expect(createAttachmentFn).not.toHaveBeenCalled();
  });

  it('uses the embedded markdown as the sole description when none was provided', async () => {
    const createIssueFn = vi.fn().mockResolvedValue(issuePayload());

    vi.doMock('../../../lib/client/index.js', () => ({
      getClientWithAuthRetry: vi
        .fn()
        .mockReturnValue(ok(mockClient({ createIssue: createIssueFn }))),
      getRequestFn: vi.fn(),
    }));
    vi.doMock('../../../lib/runner.js', () => ({ exitError: vi.fn() }));
    vi.doMock('../../../lib/upload.js', async (importOriginal) => {
      const actual = await importOriginal<typeof import('../../../lib/upload.js')>();
      return {
        ...actual,
        uploadAndClassify: vi.fn().mockResolvedValue(
          ok({
            uploaded: {
              assetUrl: 'https://storage.linear.app/uploads/file.png',
              uploadUrl: 'https://storage.googleapis.com/upload-url',
              filename: 'file.png',
            },
            isImage: true,
            embedMarkdown: '![file.png](https://storage.linear.app/uploads/file.png)',
          })
        ),
      };
    });

    const { createIssue } = await import('../create/create.js');
    await createIssue({ ...baseOpts, file: '/tmp/file.png' });

    expect(createIssueFn).toHaveBeenCalledWith(
      expect.objectContaining({
        description: '![file.png](https://storage.linear.app/uploads/file.png)',
      })
    );
  });

  it('creates the issue with the description untouched for a non-image upload, then attaches it after creation', async () => {
    const createIssueFn = vi.fn().mockResolvedValue(issuePayload());
    const createAttachmentFn = vi.fn().mockResolvedValue(attachmentPayload('att-uuid'));

    vi.doMock('../../../lib/client/index.js', () => ({
      getClientWithAuthRetry: vi
        .fn()
        .mockReturnValue(
          ok(mockClient({ createIssue: createIssueFn, createAttachment: createAttachmentFn }))
        ),
      getRequestFn: vi.fn(),
    }));
    vi.doMock('../../../lib/runner.js', () => ({ exitError: vi.fn() }));
    vi.doMock('../../../lib/upload.js', async (importOriginal) => {
      const actual = await importOriginal<typeof import('../../../lib/upload.js')>();
      return {
        ...actual,
        uploadAndClassify: vi.fn().mockResolvedValue(
          ok({
            uploaded: {
              assetUrl: 'https://storage.linear.app/uploads/file.zip',
              uploadUrl: 'https://storage.googleapis.com/upload-url',
              filename: 'file.zip',
            },
            isImage: false,
            embedMarkdown: '',
          })
        ),
      };
    });

    const { createIssue } = await import('../create/create.js');
    await createIssue({
      ...baseOpts,
      description: 'Existing description',
      file: '/tmp/file.zip',
    });

    expect(createIssueFn).toHaveBeenCalledWith(
      expect.objectContaining({ description: 'Existing description' })
    );
    expect(createAttachmentFn).toHaveBeenCalledWith({
      issueId: 'issue-uuid',
      title: 'file.zip',
      url: 'https://storage.linear.app/uploads/file.zip',
    });
  });

  it('warns but does not fail issue creation when the post-create attachment registration fails', async () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const exitErrorFn = vi.fn();
    const createIssueFn = vi.fn().mockResolvedValue(issuePayload());
    const createAttachmentFn = vi.fn().mockRejectedValue(new Error('createAttachment failed'));

    vi.doMock('../../../lib/client/index.js', () => ({
      getClientWithAuthRetry: vi
        .fn()
        .mockReturnValue(
          ok(mockClient({ createIssue: createIssueFn, createAttachment: createAttachmentFn }))
        ),
      getRequestFn: vi.fn(),
    }));
    vi.doMock('../../../lib/runner.js', () => ({ exitError: exitErrorFn }));
    vi.doMock('../../../lib/upload.js', async (importOriginal) => {
      const actual = await importOriginal<typeof import('../../../lib/upload.js')>();
      return {
        ...actual,
        uploadAndClassify: vi.fn().mockResolvedValue(
          ok({
            uploaded: {
              assetUrl: 'https://storage.linear.app/uploads/file.zip',
              uploadUrl: 'https://storage.googleapis.com/upload-url',
              filename: 'file.zip',
            },
            isImage: false,
            embedMarkdown: '',
          })
        ),
      };
    });

    const { createIssue } = await import('../create/create.js');
    await createIssue({ ...baseOpts, file: '/tmp/file.zip' });

    expect(exitErrorFn).not.toHaveBeenCalled();
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      expect.stringContaining('could not register file attachment')
    );
    expect(consoleLogSpy).toHaveBeenCalled();
  });
});

describe('updateIssue with --file', () => {
  function issuePayload() {
    return {
      get issue() {
        return Promise.resolve({
          id: 'issue-uuid',
          identifier: 'ENG-1',
          title: 'Updated issue',
          url: 'https://linear.app/issue/ENG-1',
          get state() {
            return Promise.resolve({ name: 'Todo' });
          },
        });
      },
    };
  }

  it('appends the image markdown to an explicitly provided --description', async () => {
    const updateIssueFn = vi.fn().mockResolvedValue(issuePayload());
    const createAttachmentFn = vi.fn().mockResolvedValue(attachmentPayload());
    const issueFn = vi.fn();

    vi.doMock('../../../lib/client/index.js', () => ({
      getClientWithAuthRetry: vi.fn().mockReturnValue(
        ok(
          mockClient({
            updateIssue: updateIssueFn,
            createAttachment: createAttachmentFn,
            issue: issueFn,
          })
        )
      ),
      getRequestFn: vi.fn(),
    }));
    vi.doMock('../../../lib/runner.js', () => ({ exitError: vi.fn() }));
    vi.doMock('../../../lib/upload.js', async (importOriginal) => {
      const actual = await importOriginal<typeof import('../../../lib/upload.js')>();
      return {
        ...actual,
        uploadAndClassify: vi.fn().mockResolvedValue(
          ok({
            uploaded: {
              assetUrl: 'https://storage.linear.app/uploads/img1.png',
              uploadUrl: 'https://storage.googleapis.com/upload-url',
              filename: 'img1.png',
            },
            isImage: true,
            embedMarkdown: '![img1.png](https://storage.linear.app/uploads/img1.png)',
          })
        ),
      };
    });

    const { updateIssue } = await import('../update/update.js');
    await updateIssue({
      id: 'ENG-1',
      description: 'Existing description',
      file: '/tmp/img1.png',
      plain: true,
    });

    expect(updateIssueFn).toHaveBeenCalledWith(
      'ENG-1',
      expect.objectContaining({
        description:
          'Existing description\n\n![img1.png](https://storage.linear.app/uploads/img1.png)',
      })
    );
    // No current-description fetch needed when --description was explicitly given.
    expect(issueFn).not.toHaveBeenCalled();
    expect(createAttachmentFn).not.toHaveBeenCalled();
  });

  it('fetches the current description and appends the image markdown when --description was not given', async () => {
    const updateIssueFn = vi.fn().mockResolvedValue(issuePayload());
    const issueFn = vi.fn().mockResolvedValue({ description: 'Current description' });

    vi.doMock('../../../lib/client/index.js', () => ({
      getClientWithAuthRetry: vi
        .fn()
        .mockReturnValue(ok(mockClient({ updateIssue: updateIssueFn, issue: issueFn }))),
      getRequestFn: vi.fn(),
    }));
    vi.doMock('../../../lib/runner.js', () => ({ exitError: vi.fn() }));
    vi.doMock('../../../lib/upload.js', async (importOriginal) => {
      const actual = await importOriginal<typeof import('../../../lib/upload.js')>();
      return {
        ...actual,
        uploadAndClassify: vi.fn().mockResolvedValue(
          ok({
            uploaded: {
              assetUrl: 'https://storage.linear.app/uploads/img1.png',
              uploadUrl: 'https://storage.googleapis.com/upload-url',
              filename: 'img1.png',
            },
            isImage: true,
            embedMarkdown: '![img1.png](https://storage.linear.app/uploads/img1.png)',
          })
        ),
      };
    });

    const { updateIssue } = await import('../update/update.js');
    await updateIssue({ id: 'ENG-1', file: '/tmp/img1.png', plain: true });

    expect(issueFn).toHaveBeenCalledWith('ENG-1');
    expect(updateIssueFn).toHaveBeenCalledWith(
      'ENG-1',
      expect.objectContaining({
        description:
          'Current description\n\n![img1.png](https://storage.linear.app/uploads/img1.png)',
      })
    );
  });

  it('appends both images in sequence across two --file-only invocations with no --description', async () => {
    // Simulates the description as it would exist in Linear after the first
    // update actually persisted, so the second call's fetch sees the first image.
    const issueFn = vi
      .fn()
      .mockResolvedValueOnce({ description: undefined })
      .mockResolvedValueOnce({
        description: '![img1.png](https://storage.linear.app/uploads/img1.png)',
      });
    const updateIssueFn = vi.fn().mockResolvedValue(issuePayload());

    vi.doMock('../../../lib/client/index.js', () => ({
      getClientWithAuthRetry: vi
        .fn()
        .mockReturnValue(ok(mockClient({ updateIssue: updateIssueFn, issue: issueFn }))),
      getRequestFn: vi.fn(),
    }));
    vi.doMock('../../../lib/runner.js', () => ({ exitError: vi.fn() }));
    vi.doMock('../../../lib/upload.js', async (importOriginal) => {
      const actual = await importOriginal<typeof import('../../../lib/upload.js')>();
      return {
        ...actual,
        uploadAndClassify: vi
          .fn()
          .mockResolvedValueOnce(
            ok({
              uploaded: {
                assetUrl: 'https://storage.linear.app/uploads/img1.png',
                uploadUrl: 'https://storage.googleapis.com/upload-url',
                filename: 'img1.png',
              },
              isImage: true,
              embedMarkdown: '![img1.png](https://storage.linear.app/uploads/img1.png)',
            })
          )
          .mockResolvedValueOnce(
            ok({
              uploaded: {
                assetUrl: 'https://storage.linear.app/uploads/img2.png',
                uploadUrl: 'https://storage.googleapis.com/upload-url',
                filename: 'img2.png',
              },
              isImage: true,
              embedMarkdown: '![img2.png](https://storage.linear.app/uploads/img2.png)',
            })
          ),
      };
    });

    const { updateIssue } = await import('../update/update.js');
    await updateIssue({ id: 'ENG-1', file: '/tmp/img1.png', plain: true });
    await updateIssue({ id: 'ENG-1', file: '/tmp/img2.png', plain: true });

    expect(updateIssueFn).toHaveBeenNthCalledWith(
      1,
      'ENG-1',
      expect.objectContaining({
        description: '![img1.png](https://storage.linear.app/uploads/img1.png)',
      })
    );
    expect(updateIssueFn).toHaveBeenNthCalledWith(
      2,
      'ENG-1',
      expect.objectContaining({
        description:
          '![img1.png](https://storage.linear.app/uploads/img1.png)\n\n![img2.png](https://storage.linear.app/uploads/img2.png)',
      })
    );
  });

  it('performs the update unmodified for a non-image upload, then attaches it after the update succeeds', async () => {
    const updateIssueFn = vi.fn().mockResolvedValue(issuePayload());
    const createAttachmentFn = vi.fn().mockResolvedValue(attachmentPayload('att-uuid'));
    const issueFn = vi.fn();

    vi.doMock('../../../lib/client/index.js', () => ({
      getClientWithAuthRetry: vi.fn().mockReturnValue(
        ok(
          mockClient({
            updateIssue: updateIssueFn,
            createAttachment: createAttachmentFn,
            issue: issueFn,
          })
        )
      ),
      getRequestFn: vi.fn(),
    }));
    vi.doMock('../../../lib/runner.js', () => ({ exitError: vi.fn() }));
    vi.doMock('../../../lib/upload.js', async (importOriginal) => {
      const actual = await importOriginal<typeof import('../../../lib/upload.js')>();
      return {
        ...actual,
        uploadAndClassify: vi.fn().mockResolvedValue(
          ok({
            uploaded: {
              assetUrl: 'https://storage.linear.app/uploads/file.zip',
              uploadUrl: 'https://storage.googleapis.com/upload-url',
              filename: 'file.zip',
            },
            isImage: false,
            embedMarkdown: '',
          })
        ),
      };
    });

    const { updateIssue } = await import('../update/update.js');
    await updateIssue({ id: 'ENG-1', file: '/tmp/file.zip', plain: true });

    expect(issueFn).not.toHaveBeenCalled();
    const [, input] = updateIssueFn.mock.calls[0] as [string, Record<string, unknown>];
    expect(input).not.toHaveProperty('description');
    expect(createAttachmentFn).toHaveBeenCalledWith({
      issueId: 'ENG-1',
      title: 'file.zip',
      url: 'https://storage.linear.app/uploads/file.zip',
    });
  });

  it('warns but does not fail the update when the post-update attachment registration fails', async () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const exitErrorFn = vi.fn();
    const updateIssueFn = vi.fn().mockResolvedValue(issuePayload());
    const createAttachmentFn = vi.fn().mockRejectedValue(new Error('createAttachment failed'));

    vi.doMock('../../../lib/client/index.js', () => ({
      getClientWithAuthRetry: vi
        .fn()
        .mockReturnValue(
          ok(mockClient({ updateIssue: updateIssueFn, createAttachment: createAttachmentFn }))
        ),
      getRequestFn: vi.fn(),
    }));
    vi.doMock('../../../lib/runner.js', () => ({ exitError: exitErrorFn }));
    vi.doMock('../../../lib/upload.js', async (importOriginal) => {
      const actual = await importOriginal<typeof import('../../../lib/upload.js')>();
      return {
        ...actual,
        uploadAndClassify: vi.fn().mockResolvedValue(
          ok({
            uploaded: {
              assetUrl: 'https://storage.linear.app/uploads/file.zip',
              uploadUrl: 'https://storage.googleapis.com/upload-url',
              filename: 'file.zip',
            },
            isImage: false,
            embedMarkdown: '',
          })
        ),
      };
    });

    const { updateIssue } = await import('../update/update.js');
    await updateIssue({ id: 'ENG-1', file: '/tmp/file.zip', plain: true });

    expect(exitErrorFn).not.toHaveBeenCalled();
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      expect.stringContaining('could not register file attachment')
    );
    expect(consoleLogSpy).toHaveBeenCalled();
  });
});
