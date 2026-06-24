import type { Command } from 'commander';
import { addAuthOptions, addJsonOptions } from '../../../lib/commandOptions.js';
import { DEFAULT_ISSUE_STATES } from '../../../lib/config.js';
import { queryIssues } from './query.js';

export function registerQueryCommand(issues: Command): void {
  const cmd = issues
    .command('query <term>')
    .description('Search issues by text term')
    .option('--limit <n>', 'Number of issues per page (default: 50)', '50')
    .option('--after <cursor>', 'Fetch the next page starting after this cursor')
    .option('--all', 'Fetch all pages (one request per page)')
    .option(
      '--state <tokens>',
      'Filter by state tokens (comma-separated snake_case, e.g. todo,in_progress,dev_review; default: todo,in_progress,dev_review)'
    )
    .option('--all-states', 'Return issues in ALL states (overrides --state)');

  addAuthOptions(addJsonOptions(cmd)).action(async (term: string, opts) => {
    await queryIssues({
      apiKey: opts.apiKey,
      token: opts.token,
      term,
      limit: Math.max(1, Math.min(250, Number(opts.limit) || 50)),
      after: opts.after,
      all: !!opts.all,
      json: !!opts.json,
      pretty: !!opts.pretty,
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
