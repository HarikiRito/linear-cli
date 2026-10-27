import { err, ok } from 'neverthrow';
import { afterEach, describe, expect, it, type Mock, vi } from 'vitest';

afterEach(() => {
  vi.restoreAllMocks();
  vi.clearAllMocks();
  vi.resetModules();
  process.exitCode = undefined;
});

function mockDeps(overrides: { client?: Mock; upload?: Mock } = {}) {
  const getClientWithAuthRetry = overrides.client ?? vi.fn();
  const uploadFile = overrides.upload ?? vi.fn();
  const createAttachmentRecord = vi.fn();
  const attachIfNonImage = vi.fn();
  const exitErrorFn = vi.fn();

  vi.doMock('../../../lib/client/index.js', () => ({ getClientWithAuthRetry }));
  vi.doMock('../../../lib/upload.js', () => ({
    uploadFile,
    createAttachmentRecord,
    attachIfNonImage,
  }));
  vi.doMock('../../../lib/runner.js', () => ({ exitError: exitErrorFn }));

  return {
    getClientWithAuthRetry,
    uploadFile,
    createAttachmentRecord,
    attachIfNonImage,
    exitErrorFn,
  };
}

describe('uploadAsset', () => {
  it('resolves the client with the given auth flags, uploads the path, and prints the bare asset URL', async () => {
    const client = { id: 'client' };
    const deps = mockDeps({
      client: vi.fn().mockReturnValue(ok(client)),
      upload: vi.fn().mockResolvedValue(
        ok({
          assetUrl: 'https://uploads.linear.app/w/1/photo.png',
          uploadUrl: 'https://s3.example/put',
          filename: 'photo.png',
        })
      ),
    });
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});

    const { uploadAsset } = await import('../upload.js');
    await uploadAsset({ apiKey: 'key-1', token: 'tok-1', path: 'photo.png' });

    expect(deps.getClientWithAuthRetry).toHaveBeenCalledWith({
      apiKey: 'key-1',
      token: 'tok-1',
    });
    expect(deps.uploadFile).toHaveBeenCalledTimes(1);
    expect(deps.uploadFile).toHaveBeenCalledWith(client, 'photo.png');
    expect(log).toHaveBeenCalledWith('https://uploads.linear.app/w/1/photo.png');
    expect(deps.createAttachmentRecord).not.toHaveBeenCalled();
    expect(deps.attachIfNonImage).not.toHaveBeenCalled();
    expect(deps.exitErrorFn).not.toHaveBeenCalled();
  });

  it('reports an upload failure through exitError without touching attachments', async () => {
    const uploadError = new Error('File not found: missing.png');
    const deps = mockDeps({
      client: vi.fn().mockReturnValue(ok({ id: 'client' })),
      upload: vi.fn().mockResolvedValue(err(uploadError)),
    });
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});

    const { uploadAsset } = await import('../upload.js');
    await uploadAsset({ path: 'missing.png' });

    expect(deps.exitErrorFn).toHaveBeenCalledWith(uploadError);
    expect(log).not.toHaveBeenCalled();
    expect(deps.createAttachmentRecord).not.toHaveBeenCalled();
    expect(deps.attachIfNonImage).not.toHaveBeenCalled();
  });

  it('reports a client resolution failure through exitError without uploading', async () => {
    const authError = new Error('Not authenticated');
    const deps = mockDeps({
      client: vi.fn().mockReturnValue(err(authError)),
    });

    const { uploadAsset } = await import('../upload.js');
    await uploadAsset({ path: 'photo.png' });

    expect(deps.exitErrorFn).toHaveBeenCalledWith(authError);
    expect(deps.uploadFile).not.toHaveBeenCalled();
  });
});
