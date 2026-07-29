import type { Command } from 'commander';
import { addAuthOptions, isPlain } from '../../../lib/commandOptions.js';
import { favoriteIssue, unfavoriteIssue } from './favorite.js';

export function registerFavoriteCommand(issues: Command): void {
  const cmd = issues.command('favorite <issue>').description('Add an issue to your favorites');

  addAuthOptions(cmd).action(async (issue: string, opts: { apiKey?: string; token?: string }) => {
    await favoriteIssue({ apiKey: opts.apiKey, token: opts.token, issue, plain: isPlain(cmd) });
  });
}

export function registerUnfavoriteCommand(issues: Command): void {
  const cmd = issues
    .command('unfavorite <issue>')
    .description('Remove an issue from your favorites');

  addAuthOptions(cmd).action(async (issue: string, opts: { apiKey?: string; token?: string }) => {
    await unfavoriteIssue({ apiKey: opts.apiKey, token: opts.token, issue, plain: isPlain(cmd) });
  });
}
