import type { Command } from 'commander';
import { registerListCommand } from './list/command.js';

export function registerTeams(program: Command): void {
  const teams = program
    .command('teams')
    .description('Team commands: list')
    .addHelpCommand(false);

  teams.action(() => {
    teams.help();
  });

  registerListCommand(teams);
}
