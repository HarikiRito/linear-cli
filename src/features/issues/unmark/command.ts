import type { Command } from 'commander';
import { addAuthOptions } from '../../../lib/commandOptions.js';
import { unmarkRelation } from './unmark.js';

export function registerUnmarkCommand(issues: Command): void {
  addAuthOptions(
    issues
      .command('unmark <relationId>')
      .description(
        'Remove a relation record by its ID (obtain the ID from `issues relations <issue>`)'
      )
  ).action(async (relationId: string, opts: { apiKey?: string; token?: string }) => {
    await unmarkRelation({ apiKey: opts.apiKey, token: opts.token, relationId });
  });
}
