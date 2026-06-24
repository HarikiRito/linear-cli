import type { Command } from 'commander';
import { addAuthOptions } from '../../../lib/commandOptions.js';
import { addComment } from './add.js';
import { deleteComment } from './delete.js';
import { listComments } from './list.js';
import { replyComment } from './reply.js';
import { updateComment } from './update.js';

export function registerCommentCommand(issues: Command): void {
  const comment = issues
    .command('comment')
    .description('Comment subcommands: list, add, reply, update, delete')
    .addHelpCommand(false);

  comment.action(() => {
    comment.help();
  });

  addAuthOptions(comment
    .command('list <issue>')
    .description('List comments on an issue'))
    .option('--limit <n>', 'Number of comments per page (default: 50)', '50')
    .option('--after <cursor>', 'Fetch the next page starting after this cursor')
    .option('--json', 'Output as JSON')
    .action(async (issue: string, opts: { apiKey?: string; token?: string; limit: string; after?: string; json?: boolean }) => {
      await listComments({
        apiKey: opts.apiKey,
        token: opts.token,
        issueId: issue,
        limit: Math.max(1, Math.min(250, Number(opts.limit) || 50)),
        after: opts.after,
        json: !!opts.json,
      });
    });

  addAuthOptions(comment
    .command('add <issue>')
    .description('Add a comment to an issue')
    .requiredOption('--body <text>', 'Comment body (use - to read from stdin)'))
    .option('--json', 'Output as JSON')
    .action(async (issue: string, opts: { body: string; apiKey?: string; token?: string; json?: boolean }) => {
      await addComment({
        apiKey: opts.apiKey,
        token: opts.token,
        issueId: issue,
        body: opts.body,
        json: !!opts.json,
      });
    });

  addAuthOptions(comment
    .command('reply <comment>')
    .description('Reply to a comment')
    .requiredOption('--body <text>', 'Reply body (use - to read from stdin)'))
    .option('--json', 'Output as JSON')
    .action(async (commentId: string, opts: { body: string; apiKey?: string; token?: string; json?: boolean }) => {
      await replyComment({
        apiKey: opts.apiKey,
        token: opts.token,
        parentId: commentId,
        body: opts.body,
        json: !!opts.json,
      });
    });

  addAuthOptions(comment
    .command('update <comment>')
    .description('Update a comment body')
    .requiredOption('--body <text>', 'New comment body (use - to read from stdin)'))
    .option('--json', 'Output as JSON')
    .action(async (commentId: string, opts: { body: string; apiKey?: string; token?: string; json?: boolean }) => {
      await updateComment({
        apiKey: opts.apiKey,
        token: opts.token,
        id: commentId,
        body: opts.body,
        json: !!opts.json,
      });
    });

  addAuthOptions(comment
    .command('delete <comment>')
    .description('Delete a comment')
    .option('--yes', 'Skip confirmation prompt'))
    .action(async (commentId: string, opts: { yes?: boolean; apiKey?: string; token?: string }) => {
      await deleteComment({
        apiKey: opts.apiKey,
        token: opts.token,
        id: commentId,
        yes: !!opts.yes,
      });
    });
}
