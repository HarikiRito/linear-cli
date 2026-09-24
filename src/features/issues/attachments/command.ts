import type { Command } from 'commander';
import { addAuthOptions, addProjectScopeOption, isPlain } from '../../../lib/commandOptions.js';
import { downloadAttachment } from './download.js';
import { listAttachments } from './list.js';

export function registerAttachmentsCommand(issues: Command): void {
  const attachments = issues
    .command('attachments')
    .description('Attachment subcommands: list, download')
    .addHelpCommand(false);

  attachments.action(() => {
    attachments.help();
  });

  const listSubCmd = attachments
    .command('list <issue>')
    .description('List attachments on an issue');
  addProjectScopeOption(listSubCmd);
  const listCmd = addAuthOptions(listSubCmd);
  listCmd.action(
    async (issue: string, opts: { apiKey?: string; token?: string; project?: string }) => {
      await listAttachments({
        apiKey: opts.apiKey,
        token: opts.token,
        issue,
        plain: isPlain(listCmd),
        project: opts.project,
      });
    }
  );

  const downloadSubCmd = attachments
    .command('download <issue> <attachmentId>')
    .description('Download an issue attachment to a local file')
    .option(
      '--output <path>',
      'Local file path to write to (default: derived from the attachment)'
    );
  addProjectScopeOption(downloadSubCmd);

  addAuthOptions(downloadSubCmd).action(
    async (
      issue: string,
      attachmentId: string,
      opts: { apiKey?: string; token?: string; output?: string; project?: string }
    ) => {
      await downloadAttachment({
        apiKey: opts.apiKey,
        token: opts.token,
        issue,
        attachmentId,
        output: opts.output,
        project: opts.project,
      });
    }
  );
}
