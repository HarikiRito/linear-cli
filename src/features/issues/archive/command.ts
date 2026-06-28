import type { Command } from 'commander';
import { addAuthOptions } from '../../../lib/commandOptions.js';
import { archiveIssue, unarchiveIssue } from './archive.js';

export function registerArchiveCommand(issues: Command): void {
  addAuthOptions(
    issues.command('archive <issue>').description('Archive an issue (distinct from delete/trash)')
  ).action(async (issue: string, opts: { apiKey?: string; token?: string }) => {
    await archiveIssue({ apiKey: opts.apiKey, token: opts.token, issue });
  });
}

export function registerUnarchiveCommand(issues: Command): void {
  addAuthOptions(
    issues.command('unarchive <issue>').description('Unarchive a previously archived issue')
  ).action(async (issue: string, opts: { apiKey?: string; token?: string }) => {
    await unarchiveIssue({ apiKey: opts.apiKey, token: opts.token, issue });
  });
}
