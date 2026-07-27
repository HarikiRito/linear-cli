import type { Command } from 'commander';
import { addAuthOptions, isPlain } from '../../../lib/commandOptions.js';
import { DESCRIPTION_CAVEAT, listHistory } from './history.js';

export function registerHistoryCommand(issues: Command): void {
  const cmd = issues
    .command('history <issue>')
    .description(`List history events for an issue.\n${DESCRIPTION_CAVEAT}`);

  addAuthOptions(cmd).action(async (issue: string, opts: { apiKey?: string; token?: string }) => {
    await listHistory({ apiKey: opts.apiKey, token: opts.token, id: issue, plain: isPlain(cmd) });
  });
}
