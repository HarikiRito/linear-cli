import type { Command } from 'commander';
import { addAuthOptions, isPlain } from '../../../lib/commandOptions.js';
import { archiveIssue, unarchiveIssue } from './archive.js';

export function registerArchiveCommand(issues: Command): void {
  const cmd = issues
    .command('archive <issue>')
    .description('Archive an issue (distinct from delete/trash)');

  addAuthOptions(cmd).action(async (issue: string, opts: { apiKey?: string; token?: string }) => {
    await archiveIssue({ apiKey: opts.apiKey, token: opts.token, issue, plain: isPlain(cmd) });
  });
}

export function registerUnarchiveCommand(issues: Command): void {
  const cmd = issues
    .command('unarchive <issue>')
    .description('Unarchive a previously archived issue');

  addAuthOptions(cmd).action(async (issue: string, opts: { apiKey?: string; token?: string }) => {
    await unarchiveIssue({ apiKey: opts.apiKey, token: opts.token, issue, plain: isPlain(cmd) });
  });
}
