import type { Command } from 'commander';
import { addAuthOptions, isPlain } from '../../../lib/commandOptions.js';
import { queryProjects } from './query.js';

export function registerQueryCommand(projects: Command): void {
  const cmd = projects
    .command('query <term>')
    .description(
      "Search projects like Linear's search bar (ranked by Linear; searches comments by default)"
    )
    .option(
      '--team <key-or-name>',
      "Rank this team's projects higher (default: the default project's team; not a filter)"
    )
    .option('--limit <n>', 'Number of projects per page (default: 10, max: 250)', '10')
    .option('--after <cursor>', 'Fetch the next page starting after this cursor')
    .option('--no-comments', 'Do not search comment text')
    .option('--include-archived', 'Also search archived projects');

  addAuthOptions(cmd).action(async (term: string, opts) => {
    await queryProjects({
      apiKey: opts.apiKey,
      token: opts.token,
      term,
      team: opts.team,
      limit: Math.max(1, Math.min(250, Number(opts.limit) || 10)),
      after: opts.after,
      plain: isPlain(cmd),
      includeComments: opts.comments,
      includeArchived: !!opts.includeArchived,
    });
  });
}
