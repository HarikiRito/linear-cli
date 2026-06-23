import type { Command } from 'commander';
import { DEFAULT_ISSUE_STATES } from '../../../lib/config.js';
import { queryIssues } from './query.js';

export function registerQueryCommand(issues: Command): void {
  issues
    .command('query <term>')
    .description('Search issues by text term')
    .option('--api-key <key>', 'Linear API key')
    .option('--token <token>', 'Linear access token')
    .option('--limit <n>', 'Number of issues per page (default: 50)', '50')
    .option('--after <cursor>', 'Fetch the next page starting after this cursor')
    .option('--all', 'Fetch all pages (one request per page)')
    .option('--json', 'Output as JSON')
    .option('--state <tokens>', 'Filter by state tokens (comma-separated snake_case, e.g. todo,in_progress,dev_review; default: todo,in_progress,dev_review)')
    .option('--all-states', 'Return issues in ALL states (overrides --state)')
    .action(async (term: string, opts) => {
      await queryIssues({
        apiKey: opts.apiKey,
        token: opts.token,
        term,
        limit: Math.max(1, Math.min(250, Number(opts.limit) || 50)),
        after: opts.after,
        all: !!opts.all,
        json: !!opts.json,
        states: opts.state
          ? (opts.state as string).split(',').map((s) => s.trim()).filter(Boolean)
          : [...DEFAULT_ISSUE_STATES],
        allStates: !!opts.allStates,
      });
    });
}
