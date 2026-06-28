import { ResultAsync } from 'neverthrow';
import { getClientWithAuthRetry } from '../../../lib/client/index.js';
import { coerceCliError, mapLinearError } from '../../../lib/errors.js';
import { exitError } from '../../../lib/runner.js';
import { resolveIssueIdentifier } from '../shared/resolve.js';

export interface LinkOptions {
  apiKey?: string;
  token?: string;
  issue: string;
  url: string;
  title?: string;
}

export interface UnlinkOptions {
  apiKey?: string;
  token?: string;
  attachmentId: string;
}

export async function linkAttachment(opts: LinkOptions): Promise<void> {
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

  const variables = opts.title !== undefined ? { title: opts.title } : undefined;

  const result = await ResultAsync.fromPromise(
    client
      .attachmentLinkURL(resolvedId, opts.url, variables)
      .then(async (payload) => {
        const attachment = await payload.attachment;
        return attachment?.id ?? '(unknown)';
      }),
    coerceCliError
  );

  result.match(
    (attachmentId) => {
      console.log(`URL linked. Attachment ID: ${attachmentId}`);
    },
    (e) => exitError(e)
  );
}

export async function unlinkAttachment(opts: UnlinkOptions): Promise<void> {
  const clientResult = await getClientWithAuthRetry({ apiKey: opts.apiKey, token: opts.token });
  if (clientResult.isErr()) {
    exitError(clientResult.error);
    return;
  }
  const client = clientResult.value;

  const result = await ResultAsync.fromPromise(
    client.deleteAttachment(opts.attachmentId),
    (e) => mapLinearError(e)
  );

  result.match(
    () => {
      console.log(`Attachment ${opts.attachmentId} removed.`);
    },
    (e) => exitError(e)
  );
}
