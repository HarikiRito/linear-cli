import type { Command } from 'commander';
import { addAuthOptions } from '../../../lib/commandOptions.js';
import { downloadIssueAssets } from './download.js';

export function registerIssueAssetsCommand(issues: Command): void {
  const assets = issues
    .command('assets')
    .description('Asset subcommands: download')
    .addHelpCommand(false);

  assets.action(() => {
    assets.help();
  });

  addAuthOptions(
    assets
      .command('download <issue>')
      .description(
        'Download uploads.linear.app assets embedded in an issue description and comments (not Attachment entities)'
      )
      .option(
        '--output-dir <dir>',
        'Directory to write downloaded files to (default: current directory)'
      )
  ).action(async (issue: string, opts: { apiKey?: string; token?: string; outputDir?: string }) => {
    await downloadIssueAssets({
      apiKey: opts.apiKey,
      token: opts.token,
      issue,
      outputDir: opts.outputDir,
    });
  });
}
