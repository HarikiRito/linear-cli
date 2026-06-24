import { ResultAsync } from 'neverthrow';
import { getClient, getRequestFn } from '../../../lib/client/index.js';
import { NotFoundError, mapLinearError } from '../../../lib/errors.js';
import { exitError } from '../../../lib/runner.js';
import { readStdin } from '../../../lib/stdin.js';
import { COMMENT_CREATE_MUTATION } from './mutations.js';
import { type CommentNode, type CommentResult, extractCommentCreate, renderComment } from './render.js';

const FETCH_COMMENT_ISSUE_QUERY = `
  query FetchCommentIssue($id: String!) {
    comment(id: $id) {
      issue {
        id
      }
    }
  }
`;

export interface ReplyCommentOptions {
  apiKey?: string;
  token?: string;
  parentId: string;
  body: string;
  json: boolean;
}

export async function replyComment(opts: ReplyCommentOptions): Promise<void> {
  const body = opts.body === '-' ? await readStdin() : opts.body;

  const clientResult = await getClient({ apiKey: opts.apiKey, token: opts.token });
  if (clientResult.isErr()) {
    exitError(clientResult.error);
    return;
  }
  const client = clientResult.value;
  const requestFn = getRequestFn(client);

  // Fetch the parent comment's issue id — Linear requires issueId alongside parentId
  const issueIdResult = await ResultAsync.fromPromise(
    requestFn(FETCH_COMMENT_ISSUE_QUERY, { id: opts.parentId }).then((data) => {
      const d = data as { comment: { issue: { id: string } } | null };
      if (!d.comment) throw new NotFoundError('comment', opts.parentId);
      return d.comment.issue.id;
    }),
    (e) => (e instanceof Error && 'kind' in e ? (e as ReturnType<typeof mapLinearError>) : mapLinearError(e))
  );

  if (issueIdResult.isErr()) {
    exitError(issueIdResult.error);
    return;
  }
  const issueId = issueIdResult.value;

  const result = await ResultAsync.fromPromise(
    requestFn(COMMENT_CREATE_MUTATION, {
      input: { issueId, parentId: opts.parentId, body },
    }).then((data) =>
      extractCommentCreate(data as { commentCreate: { comment: CommentNode } })
    ),
    (e) => mapLinearError(e)
  );

  result.match(
    (comment: CommentResult) => renderComment(comment, opts.json),
    (e) => exitError(e)
  );
}
