import { printJson } from '../../../lib/output/json.js';
import { markdownTable, printMarkdown } from '../../../lib/output/markdown.js';
import { prettyTable, printTable } from '../../../lib/output/table.js';

export interface CommentResult {
  id: string;
  body: string;
  url: string;
  createdAt: string;
  author: string;
}

/** Raw comment node shape returned by commentCreate / commentUpdate mutations. */
export interface CommentNode {
  id: string;
  body: string;
  url: string;
  createdAt: string;
  user: { name: string } | null;
}

const COLUMNS = ['ID', 'Body', 'URL', 'CreatedAt', 'Author'];
const toRowArr = (c: CommentResult): string[] => [c.id, c.body, c.url, c.createdAt, c.author];

export function renderComment(comment: CommentResult, json: boolean): void {
  if (json) {
    printJson({ comment });
  } else if (process.stdout.isTTY) {
    printTable(prettyTable(COLUMNS, [toRowArr(comment)]));
  } else {
    printMarkdown(markdownTable(COLUMNS, [toRowArr(comment)]));
  }
}

export function extractComment(raw: CommentNode): CommentResult {
  return {
    id: raw.id,
    body: raw.body,
    url: raw.url,
    createdAt: raw.createdAt,
    author: raw.user?.name ?? '',
  };
}

export function extractCommentCreate(data: { commentCreate: { comment: CommentNode } }): CommentResult {
  return extractComment(data.commentCreate.comment);
}

export function extractCommentUpdate(data: { commentUpdate: { comment: CommentNode } }): CommentResult {
  return extractComment(data.commentUpdate.comment);
}
