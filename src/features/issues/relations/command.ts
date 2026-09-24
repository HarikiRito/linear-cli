import type { Command } from 'commander';
import { addAuthOptions, addProjectScopeOption, isPlain } from '../../../lib/commandOptions.js';
import { listRelations } from './relations.js';

export function registerRelationsCommand(issues: Command): void {
  const cmd = issues
    .command('relations <issue>')
    .description(
      'List all relations for an issue (relation records, parent, children). Use --plain for scripting.'
    );
  addProjectScopeOption(cmd);

  addAuthOptions(cmd).action(
    async (issue: string, opts: { apiKey?: string; token?: string; project?: string }) => {
      await listRelations({
        apiKey: opts.apiKey,
        token: opts.token,
        id: issue,
        plain: isPlain(cmd),
        project: opts.project,
      });
    }
  );
}
