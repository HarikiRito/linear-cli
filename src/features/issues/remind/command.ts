import type { Command } from 'commander';
import { addAuthOptions, addProjectScopeOption, isPlain } from '../../../lib/commandOptions.js';
import { remindIssue, SUPPORTED_FORMATS } from './remind.js';

export function registerRemindCommand(issues: Command): void {
  const cmd = issues
    .command('remind <issue> <when>')
    .description(`Set a reminder for an issue.\n<when> formats: ${SUPPORTED_FORMATS}`);
  addProjectScopeOption(cmd);

  addAuthOptions(cmd).action(
    async (
      issue: string,
      when: string,
      opts: { apiKey?: string; token?: string; project?: string }
    ) => {
      await remindIssue({
        apiKey: opts.apiKey,
        token: opts.token,
        issue,
        when,
        plain: isPlain(cmd),
        project: opts.project,
      });
    }
  );
}
