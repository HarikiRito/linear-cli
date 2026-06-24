import type { Command } from 'commander';
import { addAuthOptions, addJsonOptions } from '../../lib/commandOptions.js';
import { getUser } from './get.js';
import { listUsers } from './list.js';

export function registerUsers(program: Command): void {
  const users = program
    .command('users')
    .description('User commands: list, get')
    .addHelpCommand(false);

  users.action(() => {
    users.help();
  });

  // users list
  const listCmd = users
    .command('list')
    .description('List all workspace users')
    .option('--limit <n>', 'Number of users per page (default: 50)', '50')
    .option('--after <cursor>', 'Fetch the next page starting after this cursor')
    .option('--all', 'Fetch all pages (one request per page)');

  addAuthOptions(addJsonOptions(listCmd)).action(
    async (opts: {
      limit: string;
      after?: string;
      all?: boolean;
      apiKey?: string;
      token?: string;
      json?: boolean;
      pretty?: boolean;
    }) => {
      await listUsers({
        apiKey: opts.apiKey,
        token: opts.token,
        limit: Math.max(1, Math.min(250, Number(opts.limit) || 50)),
        after: opts.after,
        all: !!opts.all,
        json: !!opts.json,
        pretty: !!opts.pretty,
      });
    }
  );

  // users get
  const getCmd = users
    .command('get <id>')
    .description('Get a user by UUID or ID');

  addAuthOptions(addJsonOptions(getCmd)).action(
    async (id: string, opts: { apiKey?: string; token?: string; json?: boolean; pretty?: boolean }) => {
      await getUser({
        apiKey: opts.apiKey,
        token: opts.token,
        id,
        json: !!opts.json,
        pretty: !!opts.pretty,
      });
    }
  );
}
