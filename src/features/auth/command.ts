import type { Command } from 'commander';
import { ResultAsync } from 'neverthrow';
import { toError } from '../../lib/errors.js';
import { exitError } from '../../lib/runner.js';
import { runLoginFlow } from './login.js';
import { runLogout } from './logout.js';

export function registerAuthCommands(program: Command): void {
  program
    .command('login')
    .description('Authenticate with Linear')
    .action(async () => {
      await ResultAsync.fromPromise(runLoginFlow(), toError).mapErr((e) => exitError(e));
    });

  program
    .command('logout')
    .description('Remove stored credentials')
    .action(() => {
      runLogout();
    });
}
