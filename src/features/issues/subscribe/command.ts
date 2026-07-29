import type { Command } from 'commander';
import { addAuthOptions, isPlain } from '../../../lib/commandOptions.js';
import { subscribeToIssue, unsubscribeFromIssue } from './subscribe.js';

export function registerSubscribeCommand(issues: Command): void {
  const cmd = issues.command('subscribe <issue>').description('Subscribe to an issue');

  addAuthOptions(cmd).action(async (issue: string, opts: { apiKey?: string; token?: string }) => {
    await subscribeToIssue({ apiKey: opts.apiKey, token: opts.token, issue, plain: isPlain(cmd) });
  });
}

export function registerUnsubscribeCommand(issues: Command): void {
  const cmd = issues.command('unsubscribe <issue>').description('Unsubscribe from an issue');

  addAuthOptions(cmd).action(async (issue: string, opts: { apiKey?: string; token?: string }) => {
    await unsubscribeFromIssue({
      apiKey: opts.apiKey,
      token: opts.token,
      issue,
      plain: isPlain(cmd),
    });
  });
}
