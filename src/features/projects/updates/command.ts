import type { Command } from 'commander';
import { addAuthOptions, isPlain } from '../../../lib/commandOptions.js';
import { createProjectUpdate } from './create.js';
import { getProjectUpdate } from './get.js';
import { listProjectUpdates } from './list.js';

const collect = (value: string, prev: string[]): string[] => [...prev, value];

export function registerUpdatesCommand(projects: Command): void {
  const updates = projects
    .command('updates')
    .description('Project update subcommands: create, list, get')
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

  const listCmd = addAuthOptions(
    updates
      .command('list')
      .description('List project updates, newest first')
      .requiredOption('--project <name-or-id>', 'Project name or ID')
      .option('--limit <n>', 'Number of updates per page (default: 10)', '10')
      .option('--after <cursor>', 'Fetch the next page starting after this cursor')
  );
  listCmd.action(
    async (opts: {
      project: string;
      limit: string;
      after?: string;
      apiKey?: string;
      token?: string;
    }) => {
      await listProjectUpdates({
        apiKey: opts.apiKey,
        token: opts.token,
        project: opts.project,
        limit: Math.max(1, Math.min(250, Math.trunc(Number(opts.limit)) || 10)),
        after: opts.after,
        plain: isPlain(listCmd),
      });
    }
  );

  const getCmd = addAuthOptions(
    updates
      .command('get')
      .description('Show a project update')
      .argument('<id>', 'Project update ID')
  );
  getCmd.action(async (id: string, opts: { apiKey?: string; token?: string }) => {
    await getProjectUpdate({
      apiKey: opts.apiKey,
      token: opts.token,
      id,
      plain: isPlain(getCmd),
    });
  });
}
