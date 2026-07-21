import { ResultAsync } from 'neverthrow';
import { getClientWithAuthRetry } from '../../../lib/client/index.js';
import { coerceCliError } from '../../../lib/errors.js';
import { exitError } from '../../../lib/runner.js';
import { uploadFile } from '../../../lib/upload.js';
import { resolveIssueIdentifier } from '../shared/resolve.js';

export interface AttachFileOptions {
  apiKey?: string;
  token?: string;
  issue: string;
  file: string;
}

export async function attachFile(opts: AttachFileOptions): Promise<void> {
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

  const uploadResult = await uploadFile(client, opts.file);
  if (uploadResult.isErr()) {
    exitError(uploadResult.error);
    return;
  }

  const { assetUrl, filename } = uploadResult.value;

  const result = await ResultAsync.fromPromise(
    client
      .createAttachment({ issueId: resolvedId, title: filename, url: assetUrl })
      .then(async (payload) => {
        const attachment = await payload.attachment;
        return attachment?.id ?? '(unknown)';
      }),
    coerceCliError
  );

  result.match(
    (attachmentId) => {
      console.log(`File attached. Attachment ID: ${attachmentId}`);
    },
    (e) => exitError(e)
  );
}
