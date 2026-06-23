import { Command } from 'commander';
import { registerAuthCommands } from './features/auth/command.js';
import { registerWhoami } from './features/auth/whoami.js';
import { registerIssues } from './features/issues/command.js';
import { registerProjects } from './features/projects/command.js';
import { registerTeams } from './features/teams/command.js';

const program = new Command();

program
  .name('linear')
  .description('Linear CLI — designed for agent/programmatic use')
  .version('0.1.0')
  .exitOverride(); // Commander parse errors become thrown exceptions, not process.exit

registerAuthCommands(program);
registerWhoami(program);
registerIssues(program);
registerTeams(program);
registerProjects(program);

program.parseAsync(process.argv).catch((err: unknown) => {
  // exitOverride() converts Commander exits to thrown CommanderErrors.
  // Informational outcomes (help, version) are not errors — leave exitCode 0.
  if (err instanceof Error && 'code' in err) {
    const code = (err as { code: string }).code;
    if (
      code === 'commander.helpDisplayed' ||
      code === 'commander.help' ||
      code === 'commander.version'
    ) {
      return; // exit 0
    }
  }
  const message = err instanceof Error ? err.message : String(err);
  console.error(`Error: ${message}`);
  process.exitCode = 1;
});
