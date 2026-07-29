import type { Command } from 'commander';
import { addAuthOptions, isPlain } from '../../../lib/commandOptions.js';
import { attachFile } from './upload.js';

export function registerUploadCommand(issues: Command): void {
  const cmd = issues
    .command('upload <issue> <file>')
    .description('Upload a local file as an attachment to an issue');

  addAuthOptions(cmd).action(
    async (issue: string, file: string, opts: { apiKey?: string; token?: string }) => {
      await attachFile({
        apiKey: opts.apiKey,
        token: opts.token,
        issue,
        file,
        plain: isPlain(cmd),
      });
    }
  );
}
