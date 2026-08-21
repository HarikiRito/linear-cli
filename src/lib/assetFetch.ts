import { basename } from 'node:path';
import { Result, ResultAsync } from 'neverthrow';
import { isTrustedAttachmentHost } from './config.js';
import { type CliError, coerceCliError } from './errors.js';

export interface AssetCredential {
  type: 'apiKey' | 'accessToken';
  value: string;
}

/** Distinct error kind for a failed asset GET, so coerceCliError preserves the message as-is. */
export class AssetDownloadError extends Error {
  readonly kind = 'AssetDownloadError' as const;
  constructor(message: string) {
    super(message);
    this.name = 'AssetDownloadError';
  }
}

/**
 * Strip any directory components and path-traversal/null-byte sequences from a
 * candidate filename so it can never escape the intended output directory.
 */
function sanitizeFilename(name: string): string {
  const stripped = basename(name.replace(/\0/g, ''));
  return stripped === '.' || stripped === '..' ? '' : stripped;
}

/** Derive a local filename from a URL's last path segment, falling back to a generic name. */
export function deriveFilenameFromUrl(url: string, fallback = 'asset'): string {
  const last = url.split('/').filter(Boolean).pop();
  const fromUrl = last ? sanitizeFilename(last) : '';
  return fromUrl || fallback;
}

/** Derive a local filename from a title first, falling back to the URL's last path segment. */
export function deriveFilename(title: string, url: string): string {
  const fromTitle = sanitizeFilename(title.trim());
  return fromTitle || deriveFilenameFromUrl(url, 'attachment');
}

/** Format the resolved credential the same way LinearClient does internally (see @linear/sdk parseClientOptions): OAuth as `Bearer <token>`, API keys raw. */
function formatAuthorization(cred: AssetCredential): string {
  return cred.type === 'accessToken'
    ? cred.value.startsWith('Bearer ')
      ? cred.value
      : `Bearer ${cred.value}`
    : cred.value;
}

/**
 * Fetch bytes from an asset URL, attaching the CLI's live credentials ONLY
 * when the URL's host is on the trusted Linear allowlist. Asset URLs can be
 * attacker-influenceable (an attachment's `url`, or a link embedded in issue/
 * comment markdown), so credentials must never be sent to arbitrary hosts —
 * downloads unauthenticated with a warning instead.
 */
export function fetchAssetBytes(
  url: string,
  cred: AssetCredential,
  opts: { errorLabel?: string } = {}
): ResultAsync<Buffer, CliError> {
  const label = opts.errorLabel ?? 'Asset';
  const hostname = Result.fromThrowable(
    () => new URL(url).hostname,
    () => undefined
  )().unwrapOr(undefined);

  const headers: Record<string, string> = {};
  if (hostname && isTrustedAttachmentHost(hostname)) {
    headers.Authorization = formatAuthorization(cred);
  } else {
    console.error(
      `Warning: ${label.toLowerCase()} host "${hostname ?? url}" is not a trusted Linear domain; downloading without credentials.`
    );
  }

  return ResultAsync.fromPromise(
    fetch(url, { headers }).then(async (res) => {
      if (!res.ok) {
        const statusText = res.statusText || `HTTP ${res.status}`;
        throw new AssetDownloadError(`${label} download failed (${res.status}): ${statusText}`);
      }
      return Buffer.from(await res.arrayBuffer());
    }),
    coerceCliError
  );
}
