import { ResultAsync } from 'neverthrow';
import { getClientWithAuthRetry } from '../../../lib/client/index.js';
import { exitError } from '../../../lib/runner.js';
import { readStdin } from '../../../lib/stdin.js';
import { embedMarkdown, uploadFile } from '../../../lib/upload.js';
import { mapIssueNotFoundError, resolveIssueIdentifier } from '../shared/resolve.js';
import { buildCommentResult, type CommentResult, renderComment } from './render.js';

export interface AddCommentOptions {
  apiKey?: string;
  token?: string;
  issueId: string;
  body: string;
  plain: boolean;
  file?: string;
}

export async function addComment(opts: AddCommentOptions): Promise<void> {
  let body = opts.body === '-' ? await readStdin() : opts.body;

  const clientResult = await getClientWithAuthRetry({ apiKey: opts.apiKey, token: opts.token });
  if (clientResult.isErr()) {
    exitError(clientResult.error);
    return;
  }
  const client = clientResult.value;

  // Upload file if --file provided
  if (opts.file) {
    const uploadResult = await uploadFile(client, opts.file);
    if (uploadResult.isErr()) {
      exitError(uploadResult.error);
      return;
    }
    const md = embedMarkdown(uploadResult.value);
    body = body ? `${body}\n\n${md}` : md;
  }

  // Resolve bare issue numbers (e.g. "153") via the default team, same as other
  // issue commands (get/update) — see H-163. Full identifiers/UUIDs pass through.
  const idResult = await resolveIssueIdentifier(opts.issueId, client);
  if (idResult.isErr()) {
    exitError(idResult.error);
    return;
  }
  const issueId = idResult.value;

  const result = await ResultAsync.fromPromise(
    client.createComment({ issueId, body }).then(buildCommentResult),
    (e) => mapIssueNotFoundError(e, issueId)
  );

  result.match(
    (comment: CommentResult) => renderComment(comment, opts.plain),
    (e) => exitError(e)
  );
}
