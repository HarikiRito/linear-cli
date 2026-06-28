import type { Command } from 'commander';
import { addAuthOptions, addPlainOption } from '../../../lib/commandOptions.js';
import { listHistory, DESCRIPTION_CAVEAT } from './history.js';

export function registerHistoryCommand(issues: Command): void {
  const cmd = issues
    .command('history <issue>')
    .description(
      `List history events for an issue.\n${DESCRIPTION_CAVEAT}`
    );

  addAuthOptions(addPlainOption(cmd)).action(
    async (issue: string, opts: { apiKey?: string; token?: string; plain?: boolean }) => {
      await listHistory({ apiKey: opts.apiKey, token: opts.token, id: issue, plain: !!opts.plain });
    }
  );
}
