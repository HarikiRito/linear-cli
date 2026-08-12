import type { Command } from 'commander';
import { addAuthOptions, isPlain } from '../../../lib/commandOptions.js';
import { linkAttachment, unlinkAttachment } from './link.js';

export function registerLinkCommand(issues: Command): void {
  const cmd = issues
    .command('link <issue> <url>')
    .description('Attach a URL to an issue')
    .option('--title <text>', 'Title for the attachment');

  addAuthOptions(cmd).action(
    async (
      issue: string,
      url: string,
      opts: { title?: string; apiKey?: string; token?: string }
    ) => {
      await linkAttachment({
        apiKey: opts.apiKey,
        token: opts.token,
        issue,
        url,
        title: opts.title,
        plain: isPlain(cmd),
      });
    }
  );
}

export function registerUnlinkCommand(issues: Command): void {
  const cmd = issues
    .command('unlink <attachmentId>')
    .description('Remove an attachment by its ID (obtain the ID from `issues link` output)');

  addAuthOptions(cmd).action(
    async (attachmentId: string, opts: { apiKey?: string; token?: string }) => {
      await unlinkAttachment({
        apiKey: opts.apiKey,
        token: opts.token,
        attachmentId,
        plain: isPlain(cmd),
      });
    }
  );
}
