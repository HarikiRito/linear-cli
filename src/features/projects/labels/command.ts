import type { Command } from 'commander';
import { addAuthOptions, addJsonOptions } from '../../../lib/commandOptions.js';
import { listProjectLabels } from './labels.js';

export function registerLabelsCommand(projects: Command): void {
  const cmd = projects
    .command('labels')
    .description('List labels for a project')
    .requiredOption('--project <id-or-name>', 'Project ID or name')
    .option('--limit <n>', 'Number of labels per page (default: 50)', '50')
    .option('--after <cursor>', 'Fetch the next page starting after this cursor')
    .option('--all', 'Fetch all pages (one request per page)');

  addAuthOptions(addJsonOptions(cmd)).action(
    async (opts: {
      project: string;
      limit: string;
      after?: string;
      all?: boolean;
      apiKey?: string;
      token?: string;
      json?: boolean;
      pretty?: boolean;
    }) => {
      await listProjectLabels({
        apiKey: opts.apiKey,
        token: opts.token,
        project: opts.project,
        limit: Math.max(1, Math.min(250, Number(opts.limit) || 50)),
        after: opts.after,
        all: !!opts.all,
        json: !!opts.json,
        pretty: !!opts.pretty,
      });
    }
  );
}
