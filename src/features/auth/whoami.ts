import type { Command } from 'commander';
import { ResultAsync } from 'neverthrow';
import { getClientWithAuthRetry } from '../../lib/client/index.js';
import { addPlainOption } from '../../lib/commandOptions.js';
import { mapLinearError } from '../../lib/errors.js';
import { renderPlainRecord } from '../../lib/output/plain.js';
import { prettyTable, printTable } from '../../lib/output/table.js';
import { exitError } from '../../lib/runner.js';

export interface WhoamiData {
  id: string;
  name: string;
  email: string;
  workspace: string;
}

export interface WhoamiOptions {
  apiKey?: string;
  token?: string;
  plain: boolean;
}

export async function runWhoami(opts: WhoamiOptions): Promise<void> {
  const result = await getClientWithAuthRetry({ apiKey: opts.apiKey, token: opts.token, allowInteractive: false }).andThen((client) =>
    ResultAsync.fromPromise(
      (async (): Promise<WhoamiData> => {
        const [viewer, organization] = await Promise.all([client.viewer, client.organization]);
        return {
          id: viewer.id,
          name: viewer.name,
          email: viewer.email ?? '',
          workspace: organization.name,
        } satisfies WhoamiData;
      })(),
      (e) => mapLinearError(e)
    )
  );

  result.match(
    (data) => {
      if (opts.plain) {
        console.log(renderPlainRecord('User', data.name, [
          { key: 'id', value: data.id },
          { key: 'email', value: data.email },
          { key: 'workspace', value: data.workspace },
        ]));
      } else {
        const rows: string[][] = [
          ['Name', data.name],
          ['Email', data.email],
          ['Workspace', data.workspace],
        ];
        printTable(prettyTable(['Field', 'Value'], rows));
      }
    },
    (e) => {
      if (e.kind === 'UnauthenticatedError') {
        console.error('Not authenticated. Run `linear login` to authenticate.');
        process.exitCode = 1;
      } else {
        exitError(e);
      }
    }
  );
}

export function registerWhoami(program: Command): void {
  const cmd = program
    .command('whoami')
    .description('Show the currently authenticated user')
    .option('--api-key <key>', 'Linear API key')
    .option('--token <token>', 'Linear access token');

  addPlainOption(cmd).action(async (opts) => {
    await runWhoami({
      apiKey: opts.apiKey,
      token: opts.token,
      plain: !!opts.plain,
    });
  });
}
