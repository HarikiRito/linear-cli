import { writeFileSync } from 'node:fs';
import { deriveFilenameFromUrl, fetchAssetBytes } from '../../lib/assetFetch.js';
import { exitError } from '../../lib/runner.js';
import { resolveCredential } from '../auth/resolve.js';

export interface DownloadAssetOptions {
  apiKey?: string;
  token?: string;
  url: string;
  output?: string;
}

export async function downloadAsset(opts: DownloadAssetOptions): Promise<void> {
  const credResult = await resolveCredential({ apiKey: opts.apiKey, token: opts.token });
  if (credResult.isErr()) {
    exitError(credResult.error);
    return;
  }

  const downloadResult = await fetchAssetBytes(opts.url, credResult.value);
  if (downloadResult.isErr()) {
    exitError(downloadResult.error);
    return;
  }

  const outputPath = opts.output ?? deriveFilenameFromUrl(opts.url);
  writeFileSync(outputPath, downloadResult.value);
  console.log(`Asset downloaded to ${outputPath}`);
}
