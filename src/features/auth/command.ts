import type { Command } from 'commander';
import { exitError } from '../../lib/runner.js';
import { runLoginFlow } from './login.js';
import { runLogout } from './logout.js';

export function registerAuthCommands(program: Command): void {
  program
    .command('login')
    .description('Authenticate with Linear')
    .action(async () => {
      try {
        await runLoginFlow();
      } catch (e) {
        exitError({ message: e instanceof Error ? e.message : String(e) });
      }
    });

  program
    .command('logout')
    .description('Remove stored credentials')
    .action(() => {
      runLogout();
    });
}
