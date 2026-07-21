import { afterEach, describe, expect, it, vi } from 'vitest';

afterEach(() => {
  vi.restoreAllMocks();
});

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
