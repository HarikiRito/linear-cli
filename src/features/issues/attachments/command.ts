import type { Command } from 'commander';
import { addAuthOptions, addPlainOption } from '../../../lib/commandOptions.js';
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

  const listCmd = addAuthOptions(
    attachments.command('list <issue>').description('List attachments on an issue')
  );
  addPlainOption(listCmd).action(
    async (issue: string, opts: { apiKey?: string; token?: string; plain?: boolean }) => {
      await listAttachments({
        apiKey: opts.apiKey,
        token: opts.token,
        issue,
        plain: !!opts.plain,
      });
    }
  );

  addAuthOptions(
    attachments
      .command('download <issue> <attachmentId>')
      .description('Download an issue attachment to a local file')
      .option('--output <path>', 'Local file path to write to (default: derived from the attachment)')
  ).action(
    async (
      issue: string,
      attachmentId: string,
      opts: { apiKey?: string; token?: string; output?: string }
    ) => {
      await downloadAttachment({
        apiKey: opts.apiKey,
        token: opts.token,
        issue,
        attachmentId,
        output: opts.output,
      });
    }
  );
}
