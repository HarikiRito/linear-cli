import type { Command } from 'commander';
import { addAuthOptions, isPlain } from '../../../lib/commandOptions.js';
import { queryIssues } from './query.js';

export function registerQueryCommand(issues: Command): void {
  const cmd = issues
    .command('query <term>')
    .description(
      "Search issues like Linear's search bar (ranked by Linear; accepts issue identifiers; searches comments and all states by default)"
    )
    .option('--project <id-or-name>', 'Only issues in this project')
    .option(
      '--team <key-or-name>',
      "Only issues in this team (default: the default project's teams, else whole workspace)"
    )
    .option('--limit <n>', 'Number of issues per page (default: 10, max: 250)', '10')
    .option('--after <cursor>', 'Fetch the next page starting after this cursor')
    .option(
      '--state <tokens>',
      'Only these state tokens (comma-separated snake_case, e.g. todo,in_progress,done; default: all states)'
    )
    .option('--no-comments', 'Do not search comment text')
    .option('--include-archived', 'Also search archived issues');

  addAuthOptions(cmd).action(async (term: string, opts) => {
    await queryIssues({
      apiKey: opts.apiKey,
      token: opts.token,
      term,
      project: opts.project,
      team: opts.team,
      limit: Math.max(1, Math.min(250, Number(opts.limit) || 10)),
      after: opts.after,
      plain: isPlain(cmd),
      states: opts.state
        ? (opts.state as string)
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean)
        : [],
      includeComments: opts.comments,
      includeArchived: !!opts.includeArchived,
    });
  });
}
