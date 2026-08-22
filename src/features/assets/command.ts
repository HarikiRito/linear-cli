import type { Command } from 'commander';
import { addAuthOptions } from '../../lib/commandOptions.js';
import { downloadAsset } from './download.js';

export function registerAssets(program: Command): void {
  const assets = program
    .command('assets')
    .description('Asset subcommands: download')
    .addHelpCommand(false);

  assets.action(() => {
    assets.help();
  });

  addAuthOptions(
    assets
      .command('download <url>')
      .description(
        'Download a known Linear-hosted asset URL (e.g. an uploads.linear.app link embedded in markdown) to a local file'
      )
      .option('--output <path>', 'Local file path to write to (default: derived from the URL)')
  ).action(async (url: string, opts: { apiKey?: string; token?: string; output?: string }) => {
    await downloadAsset({ apiKey: opts.apiKey, token: opts.token, url, output: opts.output });
  });
}
