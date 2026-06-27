import { ResultAsync } from 'neverthrow';
import { getClientWithAuthRetry, getRequestFn } from '../../../lib/client/index.js';
import { coerceCliError, mapLinearError, NotFoundError } from '../../../lib/errors.js';
import { exitError } from '../../../lib/runner.js';
import { readStdin } from '../../../lib/stdin.js';
import { COMMENT_ISSUE_ID_QUERY } from './queries.js';
import { buildCommentResult, type CommentResult, renderComment } from './render.js';

export interface ReplyCommentOptions {
  apiKey?: string;
  token?: string;
  parentId: string;
  body: string;
  plain: boolean;
}

export async function replyComment(opts: ReplyCommentOptions): Promise<void> {
  const body = opts.body === '-' ? await readStdin() : opts.body;

  const clientResult = await getClientWithAuthRetry({ apiKey: opts.apiKey, token: opts.token });
  if (clientResult.isErr()) {
    exitError(clientResult.error);
    return;
  }
  const client = clientResult.value;

  const requestFn = getRequestFn(client);

  // Fetch the parent comment's issueId in a single query — Linear requires issueId alongside parentId.
  const issueIdResult = await ResultAsync.fromPromise(
    requestFn(COMMENT_ISSUE_ID_QUERY, { id: opts.parentId }).then((data) => {
      const issueId = data.comment?.issueId;
      if (!issueId) throw new NotFoundError('comment', opts.parentId);
      return issueId;
    }),
    (e) => coerceCliError(e)
  );

  if (issueIdResult.isErr()) {
    exitError(issueIdResult.error);
    return;
  }
  const issueId = issueIdResult.value;

  const result = await ResultAsync.fromPromise(
    client.createComment({ issueId, parentId: opts.parentId, body }).then(buildCommentResult),
    (e) => mapLinearError(e)
  );

  result.match(
    (comment: CommentResult) => renderComment(comment, opts.plain),
    (e) => exitError(e)
  );
}
