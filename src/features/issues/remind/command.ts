import type { Command } from 'commander';
import { addAuthOptions } from '../../../lib/commandOptions.js';
import { remindIssue, SUPPORTED_FORMATS } from './remind.js';

export function registerRemindCommand(issues: Command): void {
  addAuthOptions(
    issues
      .command('remind <issue> <when>')
      .description(
        `Set a reminder for an issue.\n<when> formats: ${SUPPORTED_FORMATS}`
      )
  ).action(async (issue: string, when: string, opts: { apiKey?: string; token?: string }) => {
    await remindIssue({ apiKey: opts.apiKey, token: opts.token, issue, when });
  });
}
