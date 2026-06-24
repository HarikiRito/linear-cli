import { ResultAsync } from 'neverthrow';
import { getClient, getRequestFn } from '../../../lib/client/index.js';
import { mapLinearError } from '../../../lib/errors.js';
import { exitError } from '../../../lib/runner.js';
import { readStdin } from '../../../lib/stdin.js';
import { COMMENT_UPDATE_MUTATION } from './mutations.js';
import { type CommentNode, type CommentResult, extractCommentUpdate, renderComment } from './render.js';

export interface UpdateCommentOptions {
  apiKey?: string;
  token?: string;
  id: string;
  body: string;
  json: boolean;
}

export async function updateComment(opts: UpdateCommentOptions): Promise<void> {
  const body = opts.body === '-' ? await readStdin() : opts.body;

  const clientResult = await getClient({ apiKey: opts.apiKey, token: opts.token });
  if (clientResult.isErr()) {
    exitError(clientResult.error);
    return;
  }
  const client = clientResult.value;
  const requestFn = getRequestFn(client);

  const result = await ResultAsync.fromPromise(
    requestFn(COMMENT_UPDATE_MUTATION, { id: opts.id, input: { body } }).then((data) =>
      extractCommentUpdate(data as { commentUpdate: { comment: CommentNode } })
    ),
    (e) => mapLinearError(e)
  );

  result.match(
    (comment: CommentResult) => renderComment(comment, opts.json),
    (e) => exitError(e)
  );
}
