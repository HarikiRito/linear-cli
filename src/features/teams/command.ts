import type { Command } from 'commander';
import { registerGetCommand } from './get/command.js';
import { registerListCommand } from './list/command.js';

export function registerTeams(program: Command): void {
  const teams = program
    .command('teams')
    .description('Team commands: list, get')
    .addHelpCommand(false);

  teams.action(() => {
    teams.help();
  });

  registerListCommand(teams);
  registerGetCommand(teams);
}
