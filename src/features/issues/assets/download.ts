import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { Result, ResultAsync } from 'neverthrow';
import { deriveFilenameFromUrl, fetchAssetBytes } from '../../../lib/assetFetch.js';
import { getClientWithAuthRetry, getRequestFn } from '../../../lib/client/index.js';
import { isTrustedAttachmentHost } from '../../../lib/config.js';
import { coerceCliError, NotFoundError, toError } from '../../../lib/errors.js';
import { exitError } from '../../../lib/runner.js';
import { resolveCredential } from '../../auth/resolve.js';
import { resolveIssueIdentifier } from '../shared/resolve.js';
import { GET_ISSUE_ASSETS_QUERY } from './queries.js';

export interface DownloadIssueAssetsOptions {
  apiKey?: string;
  token?: string;
  issue: string;
  outputDir?: string;
}

// Any http(s) URL token embedded in markdown (image/link syntax, angle-bracket
// autolinks, plain text) — trust is re-verified per-URL via isTrustedAttachmentHost
// below, so an overly broad match here is safe.
const URL_REGEX = /https?:\/\/[^\s)\]"'<>]+/g;
// Trailing sentence/markdown punctuation that commonly follows a bare URL in
// prose (e.g. "see <url>." or "**<url>**") but is never part of the URL itself.
const TRAILING_PUNCTUATION_REGEX = /[.,;:!?*_]+$/;

/** Pull out every embedded URL whose host is on the trusted Linear allowlist, de-duplicated in first-seen order. */
export function extractTrustedAssetUrls(text: string): string[] {
  const matches = (text.match(URL_REGEX) ?? []).map((raw) =>
    raw.replace(TRAILING_PUNCTUATION_REGEX, '')
  );
  const trusted = matches.filter((raw) => {
    const hostname = Result.fromThrowable(
      () => new URL(raw).hostname,
      () => undefined
    )().unwrapOr(undefined);
    return !!hostname && isTrustedAttachmentHost(hostname);
  });
  return [...new Set(trusted)];
}

/** Disambiguate same-named assets (e.g. two "image.png" uploads) by suffixing -2, -3, ... before the extension. */
function uniqueFilename(base: string, used: Set<string>): string {
  if (!used.has(base)) {
    used.add(base);
    return base;
  }
  const dot = base.lastIndexOf('.');
  const stem = dot > 0 ? base.slice(0, dot) : base;
  const ext = dot > 0 ? base.slice(dot) : '';
  let n = 2;
  let candidate = `${stem}-${n}${ext}`;
  while (used.has(candidate)) {
    n += 1;
    candidate = `${stem}-${n}${ext}`;
  }
  used.add(candidate);
  return candidate;
}

export async function downloadIssueAssets(opts: DownloadIssueAssetsOptions): Promise<void> {
  const clientResult = await getClientWithAuthRetry({ apiKey: opts.apiKey, token: opts.token });
  if (clientResult.isErr()) {
    exitError(clientResult.error);
    return;
  }
  const client = clientResult.value;

  const idResult = await resolveIssueIdentifier(opts.issue, client);
  if (idResult.isErr()) {
    exitError(idResult.error);
    return;
  }
  const resolvedId = idResult.value;

  const requestFn = getRequestFn(client);

  const urlsResult = await ResultAsync.fromPromise(
    requestFn(GET_ISSUE_ASSETS_QUERY, { id: resolvedId }).then((data) => {
      const issue = data.issue;
      if (!issue) throw new NotFoundError('issue', resolvedId);
      const text = [issue.description ?? '', ...issue.comments.nodes.map((c) => c.body)].join('\n');
      return extractTrustedAssetUrls(text);
    }),
    coerceCliError
  );

  if (urlsResult.isErr()) {
    exitError(urlsResult.error);
    return;
  }
  const urls = urlsResult.value;

  if (urls.length === 0) {
    console.log('No uploads.linear.app assets found in the issue description or comments.');
    return;
  }

  const credResult = await resolveCredential({ apiKey: opts.apiKey, token: opts.token });
  if (credResult.isErr()) {
    exitError(credResult.error);
    return;
  }
  const cred = credResult.value;

  const outputDir = opts.outputDir ?? '.';
  const mkdirResult = Result.fromThrowable(() => {
    mkdirSync(outputDir, { recursive: true });
  }, toError)();
  if (mkdirResult.isErr()) {
    exitError(coerceCliError(mkdirResult.error));
    return;
  }

  const used = new Set<string>();
  for (const url of urls) {
    const downloadResult = await fetchAssetBytes(url, cred);
    if (downloadResult.isErr()) {
      exitError(downloadResult.error);
      return;
    }
    const filename = uniqueFilename(deriveFilenameFromUrl(url), used);
    const outputPath = join(outputDir, filename);
    writeFileSync(outputPath, downloadResult.value);
    console.log(outputPath);
  }
}
