import type { Command } from 'commander';
import { addAuthOptions, addPlainOption } from '../../../lib/commandOptions.js';
import { listRelations } from './relations.js';

export function registerRelationsCommand(issues: Command): void {
  const cmd = issues
    .command('relations <issue>')
    .description(
      'List all relations for an issue (relation records, parent, children). Use --plain for scripting.'
    );

  addAuthOptions(addPlainOption(cmd)).action(
    async (issue: string, opts: { apiKey?: string; token?: string; plain?: boolean }) => {
      await listRelations({ apiKey: opts.apiKey, token: opts.token, id: issue, plain: !!opts.plain });
    }
  );
}
