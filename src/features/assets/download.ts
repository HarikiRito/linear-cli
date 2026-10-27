import { writeFileSync } from 'node:fs';
import { err, type Result } from 'neverthrow';
import {
  deriveFilenameFromUrl,
  fetchAssetBytes,
  workspaceIdFromAssetUrl,
} from '../../lib/assetFetch.js';
import { type CliError, UnauthenticatedError } from '../../lib/errors.js';
import { exitError } from '../../lib/runner.js';
import { readWorkspaceCredential } from '../auth/credentials.js';
import {
  type ResolvedCredential,
  resolveCredential,
  resolveSessionWithRefresh,
} from '../auth/resolve.js';

export interface DownloadAssetOptions {
  apiKey?: string;
  token?: string;
  url: string;
  output?: string;
}

/** Explicit flags/env (resolveCredential rules 1-4) outrank the URL's workspace. */
function hasExplicitCredential(opts: DownloadAssetOptions): boolean {
  return Boolean(
    opts.apiKey || opts.token || process.env.LINEAR_API_KEY || process.env.LINEAR_ACCESS_TOKEN
  );
}

/**
 * Trusted Linear asset URLs embed their workspace id, which may differ from the
 * cwd-linked workspace; use that workspace's stored credential instead, else
 * Linear answers a bare 401.
 */
async function resolveDownloadCredential(
  opts: DownloadAssetOptions,
  workspaceId: string | null
): Promise<Result<ResolvedCredential, CliError>> {
  if (!workspaceId || hasExplicitCredential(opts)) {
    return resolveCredential({ apiKey: opts.apiKey, token: opts.token });
  }

  const session = await readWorkspaceCredential(workspaceId);
  if (!session) {
    return err(
      new UnauthenticatedError(
        `Asset belongs to workspace ${workspaceId}, which is not logged in. Run \`linear login\` to authenticate it.`
      )
    );
  }
  return resolveSessionWithRefresh(session, workspaceId);
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
