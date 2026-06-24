import { ResultAsync } from 'neverthrow';
import { getClient } from '../../../lib/client/index.js';
import { mapLinearError } from '../../../lib/errors.js';
import { exitError } from '../../../lib/runner.js';
import { readStdin } from '../../../lib/stdin.js';
import { buildCommentResult, type CommentResult, renderComment } from './render.js';

export interface AddCommentOptions {
  apiKey?: string;
  token?: string;
  issueId: string;
  body: string;
  json: boolean;
  pretty: boolean;
}

export async function addComment(opts: AddCommentOptions): Promise<void> {
  const body = opts.body === '-' ? await readStdin() : opts.body;

  const clientResult = await getClient({ apiKey: opts.apiKey, token: opts.token });
  if (clientResult.isErr()) {
    exitError(clientResult.error);
    return;
  }
  const client = clientResult.value;

  const result = await ResultAsync.fromPromise(
    client.createComment({ issueId: opts.issueId, body }).then(buildCommentResult),
    (e) => mapLinearError(e)
  );

  result.match(
    (comment: CommentResult) => renderComment(comment, opts.json, opts.pretty),
    (e) => exitError(e)
  );
}
