import { writeFileSync } from 'node:fs';
import { err, ok, type Result } from 'neverthrow';
import {
  deriveFilenameFromUrl,
  fetchAssetBytes,
  workspaceIdFromAssetUrl,
} from '../../lib/assetFetch.js';
import { type CliError, UnauthenticatedError } from '../../lib/errors.js';
import { exitError } from '../../lib/runner.js';
import {
  type ResolvedCredential,
  resolveCredential,
  resolveExplicitCredential,
  resolveWorkspaceCredential,
} from '../auth/resolve.js';

export interface DownloadAssetOptions {
  apiKey?: string;
  token?: string;
  url: string;
  output?: string;
}

/**
 * Explicit flags/env outrank the URL's workspace; a trusted URL's workspace id
 * outranks the cwd-linked workspace, which may differ and answer a bare 401.
 */
async function resolveDownloadCredential(
  opts: DownloadAssetOptions,
  workspaceId: string | null
): Promise<Result<ResolvedCredential, CliError>> {
  const explicit = resolveExplicitCredential(opts);
  if (explicit) return ok(explicit);
  if (!workspaceId) return resolveCredential({ apiKey: opts.apiKey, token: opts.token });

  const cred = await resolveWorkspaceCredential(workspaceId);
  if (cred.isErr()) return err(cred.error);
  if (!cred.value) {
    return err(
      new UnauthenticatedError(
        `Asset belongs to workspace ${workspaceId}, which is not logged in. Run \`linear login\` to authenticate it.`
      )
    );
  }
  return ok(cred.value);
}

export async function downloadAsset(opts: DownloadAssetOptions): Promise<void> {
  const workspaceId = workspaceIdFromAssetUrl(opts.url);
  if (workspaceId.isErr()) {
    exitError(workspaceId.error);
    return;
  }

  const credResult = await resolveDownloadCredential(opts, workspaceId.value);
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
