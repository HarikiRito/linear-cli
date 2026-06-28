import type { Command } from 'commander';
import { addAuthOptions } from '../../../lib/commandOptions.js';
import { favoriteIssue, unfavoriteIssue } from './favorite.js';

export function registerFavoriteCommand(issues: Command): void {
  addAuthOptions(
    issues.command('favorite <issue>').description('Add an issue to your favorites')
  ).action(async (issue: string, opts: { apiKey?: string; token?: string }) => {
    await favoriteIssue({ apiKey: opts.apiKey, token: opts.token, issue });
  });
}

export function registerUnfavoriteCommand(issues: Command): void {
  addAuthOptions(
    issues.command('unfavorite <issue>').description('Remove an issue from your favorites')
  ).action(async (issue: string, opts: { apiKey?: string; token?: string }) => {
    await unfavoriteIssue({ apiKey: opts.apiKey, token: opts.token, issue });
  });
}
