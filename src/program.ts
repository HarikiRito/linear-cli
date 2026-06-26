import { Command } from 'commander';
import { version } from '../package.json';
import { registerAuthCommands } from './features/auth/command.js';
import { registerWhoami } from './features/auth/whoami.js';
import { registerCycles } from './features/cycles/command.js';
import { registerDocuments } from './features/documents/command.js';
import { registerIssues } from './features/issues/command.js';
import { registerLabels } from './features/labels/command.js';
import { registerMilestones } from './features/milestones/command.js';
import { registerProjects } from './features/projects/command.js';
import { registerSearchDocumentation } from './features/search-documentation/command.js';
import { registerStatuses } from './features/statuses/command.js';
import { registerTeams } from './features/teams/command.js';
import { registerUsers } from './features/users/command.js';

export function createProgram(): Command {
  const program = new Command();

  program
    .name('linear')
    .description('Linear CLI — designed for agent/programmatic use')
    .version(version)
    .exitOverride(); // Commander parse errors become thrown exceptions, not process.exit

  registerAuthCommands(program);
  registerWhoami(program);
  registerIssues(program);
  registerTeams(program);
  registerProjects(program);
  registerUsers(program);
  registerLabels(program);
  registerStatuses(program);
  registerCycles(program);
  registerDocuments(program);
  registerMilestones(program);
  registerSearchDocumentation(program);

  return program;
}
