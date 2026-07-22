import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { LinearClient } from '@linear/sdk';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

afterEach(() => {
  vi.restoreAllMocks();
});

function mockClient(fileUploadResult: unknown): LinearClient {
  return { fileUpload: vi.fn().mockResolvedValue(fileUploadResult) } as unknown as LinearClient;
}

describe('detectMimeType', () => {
  it('returns correct MIME types for common extensions', async () => {
    const { detectMimeType } = await import('../upload.js');
    expect(detectMimeType('image.png')).toBe('image/png');
    expect(detectMimeType('photo.jpg')).toBe('image/jpeg');
    expect(detectMimeType('photo.jpeg')).toBe('image/jpeg');
    expect(detectMimeType('image.gif')).toBe('image/gif');
    expect(detectMimeType('document.pdf')).toBe('application/pdf');
    expect(detectMimeType('notes.txt')).toBe('text/plain');
    expect(detectMimeType('readme.md')).toBe('text/markdown');
    expect(detectMimeType('archive.zip')).toBe('application/zip');
    expect(detectMimeType('unknown.xzy')).toBe('application/octet-stream');
    expect(detectMimeType('file')).toBe('application/octet-stream');
  });
});

describe('isImageFile', () => {
  it('returns true for recognized image extensions', async () => {
    const { isImageFile } = await import('../upload.js');
    expect(isImageFile('photo.png')).toBe(true);
    expect(isImageFile('photo.jpg')).toBe(true);
    expect(isImageFile('photo.jpeg')).toBe(true);
    expect(isImageFile('photo.gif')).toBe(true);
    expect(isImageFile('photo.webp')).toBe(true);
    expect(isImageFile('photo.svg')).toBe(true);
  });

  it('is case-insensitive', async () => {
    const { isImageFile } = await import('../upload.js');
    expect(isImageFile('photo.PNG')).toBe(true);
    expect(isImageFile('photo.JPG')).toBe(true);
  });

  it('returns false for non-image extensions and extensionless files', async () => {
    const { isImageFile } = await import('../upload.js');
    expect(isImageFile('report.pdf')).toBe(false);
    expect(isImageFile('archive.zip')).toBe(false);
    expect(isImageFile('notes.txt')).toBe(false);
    expect(isImageFile('binary')).toBe(false);
  });
});

describe('embedMarkdown', () => {
  it('renders image markdown for .png files', async () => {
    const { embedMarkdown } = await import('../upload.js');
    const result = {
      assetUrl: 'https://storage.linear.app/uploads/file.png',
      uploadUrl: 'https://storage.example.com/upload',
      filename: 'file.png',
    };
    expect(embedMarkdown(result)).toBe('![file.png](https://storage.linear.app/uploads/file.png)');
  });

  it('renders image markdown for .jpg and .jpeg', async () => {
    const { embedMarkdown } = await import('../upload.js');
    expect(
      embedMarkdown({ assetUrl: 'https://ex.co/a.jpg', uploadUrl: 'https://up', filename: 'a.jpg' })
    ).toBe('![a.jpg](https://ex.co/a.jpg)');
    expect(
      embedMarkdown({
        assetUrl: 'https://ex.co/a.jpeg',
        uploadUrl: 'https://up',
        filename: 'a.jpeg',
      })
    ).toBe('![a.jpeg](https://ex.co/a.jpeg)');
  });

  it('renders link markdown for non-image files', async () => {
    const { embedMarkdown } = await import('../upload.js');
    const result = {
      assetUrl: 'https://storage.linear.app/uploads/report.pdf',
      uploadUrl: 'https://storage.example.com/upload',
      filename: 'report.pdf',
    };
    expect(embedMarkdown(result)).toBe(
      '[report.pdf](https://storage.linear.app/uploads/report.pdf)'
    );
  });

  it('handles uppercase extensions', async () => {
    const { embedMarkdown } = await import('../upload.js');
    const result = {
      assetUrl: 'https://ex.co/photo.PNG',
      uploadUrl: 'https://up',
      filename: 'photo.PNG',
    };
    expect(embedMarkdown(result)).toBe('![photo.PNG](https://ex.co/photo.PNG)');
  });

  it('renders image markdown for .svg files', async () => {
    const { embedMarkdown } = await import('../upload.js');
    const result = {
      assetUrl: 'https://ex.co/icon.svg',
      uploadUrl: 'https://up',
      filename: 'icon.svg',
    };
    expect(embedMarkdown(result)).toBe('![icon.svg](https://ex.co/icon.svg)');
  });

  it('renders link for files without extension', async () => {
    const { embedMarkdown } = await import('../upload.js');
    const result = {
      assetUrl: 'https://ex.co/binary',
      uploadUrl: 'https://up',
      filename: 'binary',
    };
    expect(embedMarkdown(result)).toBe('[binary](https://ex.co/binary)');
  });
});

describe('UploadError', () => {
  it('has the correct kind property', async () => {
    const { UploadError } = await import('../upload.js');
    const err = new UploadError('upload failed');
    expect(err.kind).toBe('UploadError');
    expect(err.message).toBe('upload failed');
    expect(err.name).toBe('UploadError');
  });
});

describe('uploadFile', () => {
  let tmpDir: string;
  let filePath: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'linear-upload-test-'));
    filePath = path.join(tmpDir, 'file.png');
    fs.writeFileSync(filePath, 'file bytes');
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('returns assetUrl, uploadUrl and filename on success', async () => {
    const { uploadFile } = await import('../upload.js');
    const client = mockClient({
      uploadFile: {
        uploadUrl: 'https://storage.googleapis.com/upload-url',
        assetUrl: 'https://storage.linear.app/uploads/file.png',
        headers: [{ key: 'x-goog-meta', value: 'abc' }],
      },
    });
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({ ok: true } as Response);

    const result = await uploadFile(client, filePath);

    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap()).toEqual({
      assetUrl: 'https://storage.linear.app/uploads/file.png',
      uploadUrl: 'https://storage.googleapis.com/upload-url',
      filename: 'file.png',
    });
  });

  it('errors when fileUpload mutation returns no uploadFile details', async () => {
    const { uploadFile } = await import('../upload.js');
    const client = mockClient({ uploadFile: null });

    const result = await uploadFile(client, filePath);

    expect(result.isErr()).toBe(true);
  });

  it('errors with an UploadError when the PUT to storage is non-ok', async () => {
    const { UploadError, uploadFile } = await import('../upload.js');
    const client = mockClient({
      uploadFile: {
        uploadUrl: 'https://storage.googleapis.com/upload-url',
        assetUrl: 'https://storage.linear.app/uploads/file.png',
        headers: [],
      },
    });
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: false,
      status: 500,
      statusText: 'Internal Server Error',
    } as Response);

    const result = await uploadFile(client, filePath);

    expect(result.isErr()).toBe(true);
    const error = result._unsafeUnwrapErr();
    expect(error).toBeInstanceOf(UploadError);
    expect(error.message).toContain('500');
    expect(error.message).toContain('Internal Server Error');
  });

  it('errors when the local file does not exist', async () => {
    const { uploadFile } = await import('../upload.js');
    const client = mockClient({});

    const result = await uploadFile(client, path.join(tmpDir, 'does-not-exist.png'));

    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr().message).toContain('File not found');
  });
});

describe('createAttachmentRecord', () => {
  it('returns the new attachment id on success', async () => {
    const { createAttachmentRecord } = await import('../upload.js');
    const createAttachmentFn = vi.fn().mockResolvedValue({
      get attachment() {
        return Promise.resolve({ id: 'att-uuid' });
      },
    });
    const client = { createAttachment: createAttachmentFn } as unknown as LinearClient;

    const result = await createAttachmentRecord(
      client,
      'issue-uuid',
      'file.png',
      'https://storage.linear.app/uploads/file.png'
    );

    expect(createAttachmentFn).toHaveBeenCalledWith({
      issueId: 'issue-uuid',
      title: 'file.png',
      url: 'https://storage.linear.app/uploads/file.png',
    });
    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap()).toBe('att-uuid');
  });

  it('errors when the payload returns no attachment', async () => {
    const { createAttachmentRecord } = await import('../upload.js');
    const client = {
      createAttachment: vi.fn().mockResolvedValue({
        get attachment() {
          return Promise.resolve(null);
        },
      }),
    } as unknown as LinearClient;

    const result = await createAttachmentRecord(
      client,
      'issue-uuid',
      'file.png',
      'https://storage.linear.app/uploads/file.png'
    );

    expect(result.isErr()).toBe(true);
  });

  it('errors when the createAttachment mutation rejects', async () => {
    const { createAttachmentRecord } = await import('../upload.js');
    const client = {
      createAttachment: vi.fn().mockRejectedValue(new Error('createAttachment mutation failed')),
    } as unknown as LinearClient;

    const result = await createAttachmentRecord(
      client,
      'issue-uuid',
      'file.png',
      'https://storage.linear.app/uploads/file.png'
    );

    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr().message).toContain('createAttachment mutation failed');
  });
});

describe('uploadAndClassify', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'linear-upload-classify-test-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('classifies an image upload and builds embed markdown', async () => {
    const { uploadAndClassify } = await import('../upload.js');
    const filePath = path.join(tmpDir, 'photo.png');
    fs.writeFileSync(filePath, 'bytes');
    const client = mockClient({
      uploadFile: {
        uploadUrl: 'https://storage.googleapis.com/upload-url',
        assetUrl: 'https://storage.linear.app/uploads/photo.png',
        headers: [],
      },
    });
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({ ok: true } as Response);

    const result = await uploadAndClassify(client, filePath);

    expect(result.isOk()).toBe(true);
    const value = result._unsafeUnwrap();
    expect(value.isImage).toBe(true);
    expect(value.embedMarkdown).toBe('![photo.png](https://storage.linear.app/uploads/photo.png)');
    expect(value.uploaded.filename).toBe('photo.png');
  });

  it('classifies a non-image upload with an empty embed markdown', async () => {
    const { uploadAndClassify } = await import('../upload.js');
    const filePath = path.join(tmpDir, 'report.pdf');
    fs.writeFileSync(filePath, 'bytes');
    const client = mockClient({
      uploadFile: {
        uploadUrl: 'https://storage.googleapis.com/upload-url',
        assetUrl: 'https://storage.linear.app/uploads/report.pdf',
        headers: [],
      },
    });
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({ ok: true } as Response);

    const result = await uploadAndClassify(client, filePath);

    expect(result.isOk()).toBe(true);
    const value = result._unsafeUnwrap();
    expect(value.isImage).toBe(false);
    expect(value.embedMarkdown).toBe('');
  });

  it('propagates an upload failure', async () => {
    const { uploadAndClassify } = await import('../upload.js');
    const client = mockClient({});

    const result = await uploadAndClassify(client, path.join(tmpDir, 'does-not-exist.png'));

    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr().message).toContain('File not found');
  });
});

describe('attachIfNonImage', () => {
  it('is a no-op when result is undefined', async () => {
    const { attachIfNonImage } = await import('../upload.js');
    const createAttachmentFn = vi.fn();
    const client = { createAttachment: createAttachmentFn } as unknown as LinearClient;

    await attachIfNonImage(client, 'issue-uuid', undefined);

    expect(createAttachmentFn).not.toHaveBeenCalled();
  });

  it('is a no-op when the file was an image', async () => {
    const { attachIfNonImage } = await import('../upload.js');
    const createAttachmentFn = vi.fn();
    const client = { createAttachment: createAttachmentFn } as unknown as LinearClient;

    await attachIfNonImage(client, 'issue-uuid', {
      isImage: true,
      embedMarkdown: '![a.png](https://ex.co/a.png)',
      uploaded: {
        assetUrl: 'https://ex.co/a.png',
        uploadUrl: 'https://up',
        filename: 'a.png',
      },
    });

    expect(createAttachmentFn).not.toHaveBeenCalled();
  });

  it('registers a non-image file as an attachment', async () => {
    const { attachIfNonImage } = await import('../upload.js');
    const createAttachmentFn = vi.fn().mockResolvedValue({
      get attachment() {
        return Promise.resolve({ id: 'att-uuid' });
      },
    });
    const client = { createAttachment: createAttachmentFn } as unknown as LinearClient;

    await attachIfNonImage(client, 'issue-uuid', {
      isImage: false,
      embedMarkdown: '',
      uploaded: {
        assetUrl: 'https://storage.linear.app/uploads/report.pdf',
        uploadUrl: 'https://up',
        filename: 'report.pdf',
      },
    });

    expect(createAttachmentFn).toHaveBeenCalledWith({
      issueId: 'issue-uuid',
      title: 'report.pdf',
      url: 'https://storage.linear.app/uploads/report.pdf',
    });
  });

  it('logs a warning instead of throwing when attachment registration fails', async () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { attachIfNonImage } = await import('../upload.js');
    const createAttachmentFn = vi.fn().mockRejectedValue(new Error('createAttachment failed'));
    const client = { createAttachment: createAttachmentFn } as unknown as LinearClient;

    await attachIfNonImage(client, 'issue-uuid', {
      isImage: false,
      embedMarkdown: '',
      uploaded: {
        assetUrl: 'https://storage.linear.app/uploads/report.pdf',
        uploadUrl: 'https://up',
        filename: 'report.pdf',
      },
    });

    expect(consoleErrorSpy).toHaveBeenCalledWith(
      expect.stringContaining('could not register file attachment')
    );
  });
});
