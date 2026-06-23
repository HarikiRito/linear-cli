import type { Command } from 'commander';
import { listProjects } from './list.js';

export function registerListCommand(projects: Command): void {
  projects
    .command('list')
    .description('List all projects')
    .option('--api-key <key>', 'Linear API key')
    .option('--token <token>', 'Linear access token')
    .option('--limit <n>', 'Number of projects per page (default: 50)', '50')
    .option('--after <cursor>', 'Fetch the next page starting after this cursor')
    .option('--all', 'Fetch all pages (one request per page)')
    .option('--json', 'Output as JSON')
    .action(async (opts) => {
      await listProjects({
        apiKey: opts.apiKey,
        token: opts.token,
        limit: Math.max(1, Math.min(250, Number(opts.limit) || 50)),
        after: opts.after,
        all: !!opts.all,
        json: !!opts.json,
      });
    });
}
