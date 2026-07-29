import { ResultAsync } from 'neverthrow';
import { getClientWithAuthRetry } from '../../../lib/client/index.js';
import { coerceCliError, mapLinearError } from '../../../lib/errors.js';
import { renderPlainRecord } from '../../../lib/output/plain.js';
import { exitError } from '../../../lib/runner.js';
import { resolveIssueIdentifier } from '../shared/resolve.js';

export interface LinkOptions {
  apiKey?: string;
  token?: string;
  issue: string;
  url: string;
  title?: string;
  plain?: boolean;
}

export interface UnlinkOptions {
  apiKey?: string;
  token?: string;
  attachmentId: string;
  plain?: boolean;
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
    client.attachmentLinkURL(resolvedId, opts.url, variables).then(async (payload) => {
      const attachment = await payload.attachment;
      return attachment?.id ?? '(unknown)';
    }),
    coerceCliError
  );

  result.match(
    (attachmentId) => {
      if (opts.plain) {
        console.log(
          renderPlainRecord('Attachment', attachmentId, [
            { key: 'issue', value: opts.issue },
            { key: 'url', value: opts.url },
          ])
        );
        return;
      }
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

  const result = await ResultAsync.fromPromise(client.deleteAttachment(opts.attachmentId), (e) =>
    mapLinearError(e)
  );

  result.match(
    () => {
      if (opts.plain) {
        console.log(
          renderPlainRecord('Attachment', opts.attachmentId, [
            { key: 'status', value: 'removed' },
          ])
        );
        return;
      }
      console.log(`Attachment ${opts.attachmentId} removed.`);
    },
    (e) => exitError(e)
  );
}
