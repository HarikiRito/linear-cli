import type { Command } from 'commander';
import { addAuthOptions, addPlainOption } from '../../../lib/commandOptions.js';
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

  const listCmd = addAuthOptions(
    comment.command('list <issue>').description('List comments on an issue')
  )
    .option('--limit <n>', 'Number of comments per page (default: 50)', '50')
    .option('--after <cursor>', 'Fetch the next page starting after this cursor');
  addPlainOption(listCmd).action(
    async (
      issue: string,
      opts: { apiKey?: string; token?: string; limit: string; after?: string; plain?: boolean }
    ) => {
      await listComments({
        apiKey: opts.apiKey,
        token: opts.token,
        issueId: issue,
        limit: Math.max(1, Math.min(250, Number(opts.limit) || 50)),
        after: opts.after,
        plain: !!opts.plain,
      });
    }
  );

  const addCmd = addAuthOptions(
    comment
      .command('add <issue>')
      .description('Add a comment to an issue')
      .requiredOption('--body <text>', 'Comment body (use - to read from stdin)')
  );
  addPlainOption(addCmd).action(
    async (
      issue: string,
      opts: { body: string; apiKey?: string; token?: string; plain?: boolean }
    ) => {
      await addComment({
        apiKey: opts.apiKey,
        token: opts.token,
        issueId: issue,
        body: opts.body,
        plain: !!opts.plain,
      });
    }
  );

  const replyCmd = addAuthOptions(
    comment
      .command('reply <comment>')
      .description('Reply to a comment')
      .requiredOption('--body <text>', 'Reply body (use - to read from stdin)')
  );
  addPlainOption(replyCmd).action(
    async (
      commentId: string,
      opts: { body: string; apiKey?: string; token?: string; plain?: boolean }
    ) => {
      await replyComment({
        apiKey: opts.apiKey,
        token: opts.token,
        parentId: commentId,
        body: opts.body,
        plain: !!opts.plain,
      });
    }
  );

  const updateCmd = addAuthOptions(
    comment
      .command('update <comment>')
      .description('Update a comment body')
      .requiredOption('--body <text>', 'New comment body (use - to read from stdin)')
  );
  addPlainOption(updateCmd).action(
    async (
      commentId: string,
      opts: { body: string; apiKey?: string; token?: string; plain?: boolean }
    ) => {
      await updateComment({
        apiKey: opts.apiKey,
        token: opts.token,
        id: commentId,
        body: opts.body,
        plain: !!opts.plain,
      });
    }
  );

  addAuthOptions(
    comment
      .command('delete <comment>')
      .description('Delete a comment')
      .option('--yes', 'Skip confirmation prompt')
  ).action(async (commentId: string, opts: { yes?: boolean; apiKey?: string; token?: string }) => {
    await deleteComment({
      apiKey: opts.apiKey,
      token: opts.token,
      id: commentId,
      yes: !!opts.yes,
    });
  });
}
