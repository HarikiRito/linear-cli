import { writeFileSync } from 'node:fs';
import { ResultAsync } from 'neverthrow';
import { deriveFilename, fetchAssetBytes } from '../../../lib/assetFetch.js';
import { getClientWithAuthRetry, getRequestFn } from '../../../lib/client/index.js';
import { coerceCliError, NotFoundError } from '../../../lib/errors.js';
import { exitError } from '../../../lib/runner.js';
import { resolveCredential } from '../../auth/resolve.js';
import { resolveIssueIdentifier } from '../shared/resolve.js';
import { GET_ATTACHMENT_QUERY } from './queries.js';

export interface DownloadAttachmentOptions {
  apiKey?: string;
  token?: string;
  issue: string;
  attachmentId: string;
  output?: string;
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
      // resolvedId is either a UUID (input already looked like one) or a
      // human-readable identifier (e.g. "EPIC-936") — resolveIssueIdentifier
      // never converts one to the other, so check both.
      const ownershipMatch =
        !!attachment &&
        (attachment.issue.id === resolvedId ||
          attachment.issue.identifier.toLowerCase() === resolvedId.toLowerCase());
      // Attachment IDs are global (not scoped to an issue), so a lookup that
      // succeeds but belongs to a different issue must be treated the same as
      // "not found" here — otherwise this becomes an IDOR letting callers
      // fetch any attachment by ID regardless of the `<issue>` argument.
      if (!ownershipMatch) {
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

  const credResult = await resolveCredential({ apiKey: opts.apiKey, token: opts.token });
  if (credResult.isErr()) {
    exitError(credResult.error);
    return;
  }

  const downloadResult = await fetchAssetBytes(url, credResult.value, {
    errorLabel: 'Attachment',
  });
  if (downloadResult.isErr()) {
    exitError(downloadResult.error);
    return;
  }

  const outputPath = opts.output ?? deriveFilename(title, url);
  writeFileSync(outputPath, downloadResult.value);
  console.log(`Attachment downloaded to ${outputPath}`);
}
