import { getClientWithAuthRetry } from '../../lib/client/index.js';
import { exitError } from '../../lib/runner.js';
import { uploadFile } from '../../lib/upload.js';

export interface UploadAssetOptions {
  apiKey?: string;
  token?: string;
  path: string;
}

/**
 * Upload a local file to Linear storage and print its asset URL. Deliberately
 * does not create an attachment record: the URL is meant to be embedded in
 * markdown by the caller.
 */
export async function uploadAsset(opts: UploadAssetOptions): Promise<void> {
  const clientResult = await getClientWithAuthRetry({ apiKey: opts.apiKey, token: opts.token });
  if (clientResult.isErr()) {
    exitError(clientResult.error);
    return;
  }

  const uploadResult = await uploadFile(clientResult.value, opts.path);
  if (uploadResult.isErr()) {
    exitError(uploadResult.error);
    return;
  }

  console.log(uploadResult.value.assetUrl);
}
