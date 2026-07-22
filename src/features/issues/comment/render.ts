import type { Comment, CommentPayload } from '@linear/sdk';
import { renderPlainRecord } from '../../../lib/output/plain.js';
import { prettyTable, printTable } from '../../../lib/output/table.js';

export interface CommentResult {
  id: string;
  body: string;
  url: string;
  createdAt: string;
  author: string;
}

/** Await the user relation on an already-fetched Comment and shape it into a CommentResult. */
export async function toCommentResult(comment: Comment): Promise<CommentResult> {
  const user = await comment.user;
  return {
    id: comment.id,
    body: comment.body,
    url: comment.url,
    createdAt: comment.createdAt.toISOString(),
    author: user?.name ?? '',
  };
}

/**
 * Resolve payload.comment, null-check it, await the user relation, and return a CommentResult.
 * Throws if the payload returns no comment (SDK contract violation).
 */
export async function buildCommentResult(payload: CommentPayload): Promise<CommentResult> {
  const comment = await payload.comment;
  if (!comment) throw new Error('comment payload returned no comment');
  return toCommentResult(comment);
}

const COLUMNS = ['ID', 'Body', 'URL', 'CreatedAt', 'Author'];
const toRowArr = (c: CommentResult): string[] => [c.id, c.body, c.url, c.createdAt, c.author];

export function renderComment(comment: CommentResult, plain: boolean): void {
  if (plain) {
    console.log(
      renderPlainRecord('Comment', comment.id, [
        { key: 'author', value: comment.author },
        { key: 'body', value: comment.body },
        { key: 'createdAt', value: comment.createdAt },
        { key: 'url', value: comment.url },
      ])
    );
    return;
  }
  printTable(prettyTable(COLUMNS, [toRowArr(comment)]));
}
