import type { Command } from 'commander';
import { addAuthOptions, addProjectScopeOption, isPlain } from '../../../lib/commandOptions.js';
import { subscribeToIssue, unsubscribeFromIssue } from './subscribe.js';

export function registerSubscribeCommand(issues: Command): void {
  const cmd = issues.command('subscribe <issue>').description('Subscribe to an issue');
  addProjectScopeOption(cmd);

  addAuthOptions(cmd).action(
    async (issue: string, opts: { apiKey?: string; token?: string; project?: string }) => {
      await subscribeToIssue({
        apiKey: opts.apiKey,
        token: opts.token,
        issue,
        plain: isPlain(cmd),
        project: opts.project,
      });
    }
  );
}

export function registerUnsubscribeCommand(issues: Command): void {
  const cmd = issues.command('unsubscribe <issue>').description('Unsubscribe from an issue');
  addProjectScopeOption(cmd);

  addAuthOptions(cmd).action(
    async (issue: string, opts: { apiKey?: string; token?: string; project?: string }) => {
      await unsubscribeFromIssue({
        apiKey: opts.apiKey,
        token: opts.token,
        issue,
        plain: isPlain(cmd),
        project: opts.project,
      });
    }
  );
}
