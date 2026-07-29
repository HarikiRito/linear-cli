import type { Command } from 'commander';
import { addAuthOptions, isPlain } from '../../../lib/commandOptions.js';
import { DEFAULT_ISSUE_STATES } from '../../../lib/config.js';
import { listIssues } from './list.js';

export function registerListCommand(issues: Command): void {
  const cmd = issues
    .command('list')
    .description('List all issues (optionally filtered by team)')
    .option('--team <team>', 'Filter by team key')
    .option('--project <id-or-name>', 'Filter by project ID or name')
    .option('--limit <n>', 'Number of issues per page (default: 50)', '50')
    .option('--after <cursor>', 'Fetch the next page starting after this cursor')
    .option('--all', 'Fetch all pages (one request per page)')
    .option(
      '--state <tokens>',
      'Filter by state tokens (comma-separated snake_case, e.g. todo,in_progress,dev_review; default: todo,in_progress,dev_review)'
    )
    .option('--all-states', 'Return issues in ALL states (overrides --state)')
    .option('--include-deleted', 'Include trashed/archived issues (excluded by default)');

  addAuthOptions(cmd).action(async (opts) => {
    await listIssues({
      apiKey: opts.apiKey,
      token: opts.token,
      team: opts.team,
      project: opts.project,
      limit: Math.max(1, Math.min(250, Number(opts.limit) || 50)),
      after: opts.after,
      all: !!opts.all,
      plain: isPlain(cmd),
      states: opts.state
        ? (opts.state as string)
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean)
        : [...DEFAULT_ISSUE_STATES],
      allStates: !!opts.allStates,
      includeDeleted: !!opts.includeDeleted,
    });
  });
}
