import type { Command } from 'commander';
import { addAuthOptions, isPlain } from '../../../lib/commandOptions.js';
import { createProjectUpdate } from './create.js';

const collect = (value: string, prev: string[]): string[] => [...prev, value];

export function registerUpdatesCommand(projects: Command): void {
  const updates = projects
    .command('updates')
    .description('Project update subcommands: create')
    .addHelpCommand(false);

  updates.action(() => {
    updates.help();
  });

  const createCmd = addAuthOptions(
    updates
      .command('create')
      .description('Post a project update')
      .requiredOption('--project <name-or-id>', 'Project name or ID')
      .option('--health <health>', 'Project health: onTrack, atRisk, offTrack', 'onTrack')
      .option('--body <text>', 'Update body (use - to read from stdin)')
      .option('--body-file <path>', 'Read the update body from a file')
      .option('--attach <file>', 'File to upload and link in the body (repeatable)', collect, [])
  );
  createCmd.action(
    async (opts: {
      project: string;
      health: string;
      body?: string;
      bodyFile?: string;
      attach: string[];
      apiKey?: string;
      token?: string;
    }) => {
      await createProjectUpdate({
        apiKey: opts.apiKey,
        token: opts.token,
        project: opts.project,
        health: opts.health,
        body: opts.body,
        bodyFile: opts.bodyFile,
        attach: opts.attach,
        plain: isPlain(createCmd),
      });
    }
  );
}
