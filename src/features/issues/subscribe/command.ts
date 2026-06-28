import type { Command } from 'commander';
import { addAuthOptions } from '../../../lib/commandOptions.js';
import { subscribeToIssue, unsubscribeFromIssue } from './subscribe.js';

export function registerSubscribeCommand(issues: Command): void {
  addAuthOptions(
    issues.command('subscribe <issue>').description('Subscribe to an issue')
  ).action(async (issue: string, opts: { apiKey?: string; token?: string }) => {
    await subscribeToIssue({ apiKey: opts.apiKey, token: opts.token, issue });
  });
}

export function registerUnsubscribeCommand(issues: Command): void {
  addAuthOptions(
    issues.command('unsubscribe <issue>').description('Unsubscribe from an issue')
  ).action(async (issue: string, opts: { apiKey?: string; token?: string }) => {
    await unsubscribeFromIssue({ apiKey: opts.apiKey, token: opts.token, issue });
  });
}
