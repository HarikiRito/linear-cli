import type { Command } from 'commander';
import { DEFAULT_ISSUE_STATES } from '../../../lib/config.js';
import { myIssues } from './me.js';

export function registerMeCommand(issues: Command): void {
  issues
    .command('me')
    .description('List issues assigned to you')
    .option('--api-key <key>', 'Linear API key')
    .option('--token <token>', 'Linear access token')
    .option('--limit <n>', 'Number of issues per page (default: 50)', '50')
    .option('--after <cursor>', 'Fetch the next page starting after this cursor')
    .option('--all', 'Fetch all pages (one request per page)')
    .option('--json', 'Output as JSON')
    .option(
      '--state <tokens>',
      'Filter by state tokens (comma-separated snake_case, e.g. todo,in_progress,dev_review; default: todo,in_progress,dev_review)'
    )
    .option('--all-states', 'Return issues in ALL states (overrides --state)')
    .action(async (opts) => {
      await myIssues({
        apiKey: opts.apiKey,
        token: opts.token,
        limit: Math.max(1, Math.min(250, Number(opts.limit) || 50)),
        after: opts.after,
        all: !!opts.all,
        json: !!opts.json,
        states: opts.state
          ? (opts.state as string)
              .split(',')
              .map((s) => s.trim())
              .filter(Boolean)
          : [...DEFAULT_ISSUE_STATES],
        allStates: !!opts.allStates,
      });
    });
}
