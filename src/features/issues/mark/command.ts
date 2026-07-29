import type { Command } from 'commander';
import { addAuthOptions, isPlain } from '../../../lib/commandOptions.js';
import { markRelation, VALID_RELATIONS } from './mark.js';

export function registerMarkCommand(issues: Command): void {
  const cmd = issues
    .command('mark <relation> <issue> <target>')
    .description(
      `Create a relation between two issues.\n<relation> must be one of: ${VALID_RELATIONS.join(', ')}`
    );

  addAuthOptions(cmd).action(
    async (
      relation: string,
      issue: string,
      target: string,
      opts: { apiKey?: string; token?: string }
    ) => {
      await markRelation({
        apiKey: opts.apiKey,
        token: opts.token,
        relation,
        issue,
        target,
        plain: isPlain(cmd),
      });
    }
  );
}
