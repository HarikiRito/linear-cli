import type { Command } from 'commander';
import { addAuthOptions } from '../../../lib/commandOptions.js';
import { branchIssue } from './branch.js';

export function registerBranchCommand(issues: Command): void {
  const cmd = issues
    .command('branch <id>')
    .description('Get the branch name for an issue (identifier like ENG-123, bare number, or UUID)')
    .option('--checkout', 'Run git checkout -b <branchName> in the current directory');

  addAuthOptions(cmd).action(
    async (
      id: string,
      opts: { apiKey?: string; token?: string; checkout?: boolean }
    ) => {
      await branchIssue({
        apiKey: opts.apiKey,
        token: opts.token,
        id,
        checkout: !!opts.checkout,
      });
    }
  );
}
