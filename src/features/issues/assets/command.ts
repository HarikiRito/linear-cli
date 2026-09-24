import type { Command } from 'commander';
import { addAuthOptions, addProjectScopeOption } from '../../../lib/commandOptions.js';
import { downloadIssueAssets } from './download.js';

export function registerIssueAssetsCommand(issues: Command): void {
  const assets = issues
    .command('assets')
    .description('Asset subcommands: download')
    .addHelpCommand(false);

  assets.action(() => {
    assets.help();
  });

  const downloadCmd = assets
    .command('download <issue>')
    .description(
      'Download uploads.linear.app assets embedded in an issue description and comments (not Attachment entities)'
    )
    .option(
      '--output-dir <dir>',
      'Directory to write downloaded files to (default: current directory)'
    );
  addProjectScopeOption(downloadCmd);

  addAuthOptions(downloadCmd).action(
    async (
      issue: string,
      opts: { apiKey?: string; token?: string; outputDir?: string; project?: string }
    ) => {
      await downloadIssueAssets({
        apiKey: opts.apiKey,
        token: opts.token,
        issue,
        outputDir: opts.outputDir,
        project: opts.project,
      });
    }
  );
}
