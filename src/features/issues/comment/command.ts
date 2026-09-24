import type { Command } from 'commander';
import { addAuthOptions, addProjectScopeOption, isPlain } from '../../../lib/commandOptions.js';
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

  const listSubCmd = comment
    .command('list <issue>')
    .description('List comments on an issue')
    .option('--limit <n>', 'Number of comments per page (default: 50)', '50')
    .option('--after <cursor>', 'Fetch the next page starting after this cursor');
  addProjectScopeOption(listSubCmd);
  const listCmd = addAuthOptions(listSubCmd);
  listCmd.action(
    async (
      issue: string,
      opts: { apiKey?: string; token?: string; limit: string; after?: string; project?: string }
    ) => {
      await listComments({
        apiKey: opts.apiKey,
        token: opts.token,
        issueId: issue,
        limit: Math.max(1, Math.min(250, Number(opts.limit) || 50)),
        after: opts.after,
        plain: isPlain(listCmd),
        project: opts.project,
      });
    }
  );

  const addSubCmd = comment
    .command('add <issue>')
    .description('Add a comment to an issue')
    .requiredOption('--body <text>', 'Comment body (use - to read from stdin)')
    .option(
      '--file <path>',
      'Local file to upload; images are embedded inline in the comment body, other file types are attached to the resource tab'
    );
  addProjectScopeOption(addSubCmd);
  const addCmd = addAuthOptions(addSubCmd);
  addCmd.action(
    async (
      issue: string,
      opts: { body: string; apiKey?: string; token?: string; file?: string; project?: string }
    ) => {
      await addComment({
        apiKey: opts.apiKey,
        token: opts.token,
        issueId: issue,
        body: opts.body,
        plain: isPlain(addCmd),
        file: opts.file,
        project: opts.project,
      });
    }
  );

  const replyCmd = addAuthOptions(
    comment
      .command('reply <comment>')
      .description('Reply to a comment')
      .requiredOption('--body <text>', 'Reply body (use - to read from stdin)')
  );
  replyCmd.action(
    async (commentId: string, opts: { body: string; apiKey?: string; token?: string }) => {
      await replyComment({
        apiKey: opts.apiKey,
        token: opts.token,
        parentId: commentId,
        body: opts.body,
        plain: isPlain(replyCmd),
      });
    }
  );

  const updateCmd = addAuthOptions(
    comment
      .command('update <comment>')
      .description('Update a comment body')
      .requiredOption('--body <text>', 'New comment body (use - to read from stdin)')
      .option(
        '--file <path>',
        'Local file to upload; images are embedded inline in the comment body, other file types are attached to the resource tab'
      )
  );
  updateCmd.action(
    async (
      commentId: string,
      opts: { body: string; apiKey?: string; token?: string; file?: string }
    ) => {
      await updateComment({
        apiKey: opts.apiKey,
        token: opts.token,
        id: commentId,
        body: opts.body,
        plain: isPlain(updateCmd),
        file: opts.file,
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
