import { writeFileSync } from 'node:fs';
import { basename } from 'node:path';
import { ResultAsync } from 'neverthrow';
import { resolveCredential } from '../../auth/resolve.js';
import { getClientWithAuthRetry, getRequestFn } from '../../../lib/client/index.js';
import { isTrustedAttachmentHost } from '../../../lib/config.js';
import { coerceCliError, NotFoundError } from '../../../lib/errors.js';
import { exitError } from '../../../lib/runner.js';
import { resolveIssueIdentifier } from '../shared/resolve.js';
import { GET_ATTACHMENT_QUERY } from './queries.js';

export interface DownloadAttachmentOptions {
  apiKey?: string;
  token?: string;
  issue: string;
  attachmentId: string;
  output?: string;
}

/** Distinct error kind for a failed asset GET, so coerceCliError preserves the message as-is. */
export class AttachmentDownloadError extends Error {
  readonly kind = 'AttachmentDownloadError' as const;
  constructor(message: string) {
    super(message);
    this.name = 'AttachmentDownloadError';
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

/** Derive a local filename from the attachment title, falling back to the URL's last path segment. */
export function deriveFilename(title: string, url: string): string {
  const fromTitle = sanitizeFilename(title.trim());
  if (fromTitle) return fromTitle;
  const last = url.split('/').filter(Boolean).pop();
  const fromUrl = last ? sanitizeFilename(last) : '';
  return fromUrl || 'attachment';
}

export async function downloadAttachment(opts: DownloadAttachmentOptions): Promise<void> {
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

  const attachmentResult = await ResultAsync.fromPromise(
    requestFn(GET_ATTACHMENT_QUERY, { id: opts.attachmentId }).then((data) => {
      const attachment = data.attachment;
      // Attachment IDs are global (not scoped to an issue), so a lookup that
      // succeeds but belongs to a different issue must be treated the same as
      // "not found" here — otherwise this becomes an IDOR letting callers
      // fetch any attachment by ID regardless of the `<issue>` argument.
      if (!attachment || attachment.issue.id !== resolvedId) {
        throw new NotFoundError('attachment', opts.attachmentId);
      }
      return { title: attachment.title, url: attachment.url };
    }),
    coerceCliError
  );

  if (attachmentResult.isErr()) {
    exitError(attachmentResult.error);
    return;
  }
  const { title, url } = attachmentResult.value;

  // The asset lives behind the same private-attachment auth as the GraphQL API,
  // so mirror LinearClient's own Authorization header construction (see
  // parseClientOptions in @linear/sdk): OAuth tokens as `Bearer <token>`, API keys raw.
  const credResult = await resolveCredential({ apiKey: opts.apiKey, token: opts.token });
  if (credResult.isErr()) {
    exitError(credResult.error);
    return;
  }
  const cred = credResult.value;
  const authorization =
    cred.type === 'accessToken'
      ? cred.value.startsWith('Bearer ')
        ? cred.value
        : `Bearer ${cred.value}`
      : cred.value;

  // Attachment URLs are attacker-influenceable (arbitrary external links), so
  // only send the CLI's live credentials to hosts Linear itself controls.
  // Anything else is fetched unauthenticated rather than leaking the token.
  let hostname: string | undefined;
  try {
    hostname = new URL(url).hostname;
  } catch {
    hostname = undefined;
  }
  const headers: Record<string, string> = {};
  if (hostname && isTrustedAttachmentHost(hostname)) {
    headers.Authorization = authorization;
  } else {
    console.error(
      `Warning: attachment host "${hostname ?? url}" is not a trusted Linear domain; downloading without credentials.`
    );
  }

  const downloadResult = await ResultAsync.fromPromise(
    fetch(url, { headers }).then(async (res) => {
      if (!res.ok) {
        const statusText = res.statusText || `HTTP ${res.status}`;
        throw new AttachmentDownloadError(
          `Attachment download failed (${res.status}): ${statusText}`
        );
      }
      return Buffer.from(await res.arrayBuffer());
    }),
    coerceCliError
  );

  if (downloadResult.isErr()) {
    exitError(downloadResult.error);
    return;
  }

  const outputPath = opts.output ?? deriveFilename(title, url);
  writeFileSync(outputPath, downloadResult.value);
  console.log(`Attachment downloaded to ${outputPath}`);
}
