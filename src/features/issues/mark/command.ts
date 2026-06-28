import type { Command } from 'commander';
import { addAuthOptions } from '../../../lib/commandOptions.js';
import { VALID_RELATIONS, markRelation } from './mark.js';

export function registerMarkCommand(issues: Command): void {
  addAuthOptions(
    issues
      .command('mark <relation> <issue> <target>')
      .description(
        `Create a relation between two issues.\n<relation> must be one of: ${VALID_RELATIONS.join(', ')}`
      )
  ).action(
    async (
      relation: string,
      issue: string,
      target: string,
      opts: { apiKey?: string; token?: string }
    ) => {
      await markRelation({ apiKey: opts.apiKey, token: opts.token, relation, issue, target });
    }
  );
}
