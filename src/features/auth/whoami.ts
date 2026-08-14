import type { Command } from 'commander';
import { ResultAsync } from 'neverthrow';
import { notifyUpdate } from '../../lib/check-version.js';
import { getClientWithAuthRetry } from '../../lib/client/index.js';
import { isPlain } from '../../lib/commandOptions.js';
import { mapLinearError } from '../../lib/errors.js';
import { renderPlainRecord } from '../../lib/output/plain.js';
import { prettyTable, printTable } from '../../lib/output/table.js';
import { exitError } from '../../lib/runner.js';
import { findProjectRoot } from '../../lib/scope.js';
import { getEntry } from '../keepalive/registry.js';

export interface WhoamiData {
  id: string;
  name: string;
  email: string;
  workspace: string;
  /** Key of the team bound to this directory, if any. */
  teamKey?: string;
}

export interface WhoamiOptions {
  apiKey?: string;
  token?: string;
  plain: boolean;
}

/** Resolve the team bound to the cwd: the linked registry entry's team only. */
function boundTeamKey(): string | undefined {
  const root = findProjectRoot(process.cwd());
  return root ? getEntry(root)?.team?.key : undefined;
}

export async function runWhoami(opts: WhoamiOptions): Promise<void> {
  const result = await getClientWithAuthRetry({
    apiKey: opts.apiKey,
    token: opts.token,
    allowInteractive: false,
  }).andThen((client) =>
    ResultAsync.fromPromise(
      (async (): Promise<WhoamiData> => {
        const [viewer, organization] = await Promise.all([client.viewer, client.organization]);
        return {
          id: viewer.id,
          name: viewer.name,
          email: viewer.email ?? '',
          workspace: organization.name,
          teamKey: boundTeamKey(),
        } satisfies WhoamiData;
      })(),
      (e) => mapLinearError(e)
    )
  );

  result.match(
    (data) => {
      const rows: Array<{ key: string; value: string }> = [
        { key: 'id', value: data.id },
        { key: 'email', value: data.email },
        { key: 'workspace', value: data.workspace },
        ...(data.teamKey ? [{ key: 'team', value: data.teamKey }] : []),
      ];
      if (opts.plain) {
        console.log(renderPlainRecord('User', data.name, rows));
      } else {
        printTable(
          prettyTable(
            ['Field', 'Value'],
            [
              ['Name', data.name],
              ['Email', data.email],
              ['Workspace', data.workspace],
              ...(data.teamKey ? ([['Team', data.teamKey]] as string[][]) : []),
            ]
          )
        );
      }

      // Fire-and-forget: don't block CLI exit on this best-effort notice.
      void notifyUpdate({ plain: opts.plain });
    },
    (e) => {
      if (e.kind === 'UnauthenticatedError') {
        // Surface the context-aware hint (login vs workspace-select).
        console.error(e.message);
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

  cmd.action(async (opts) => {
    await runWhoami({
      apiKey: opts.apiKey,
      token: opts.token,
      plain: isPlain(cmd),
    });
  });
}
