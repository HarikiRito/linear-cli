import type { Command } from 'commander';
import { ResultAsync } from 'neverthrow';
import { getClient, getRequestFn } from '../../lib/client/index.js';
import { mapLinearError } from '../../lib/errors.js';
import { printJson } from '../../lib/output/json.js';
import { markdownTable, printMarkdown } from '../../lib/output/markdown.js';
import { prettyTable, printTable } from '../../lib/output/table.js';
import { exitError } from '../../lib/runner.js';

const WHOAMI_QUERY = `
  query WhoAmI {
    viewer {
      id
      name
      email
    }
    organization {
      id
      name
      urlKey
    }
  }
`;

interface WhoamiQueryResult {
  viewer: { id: string; name: string; email: string | null };
  organization: { id: string; name: string; urlKey: string };
}

export interface WhoamiData {
  id: string;
  name: string;
  email: string;
  workspace: string;
}

export interface WhoamiOptions {
  apiKey?: string;
  token?: string;
  json: boolean;
}

export async function runWhoami(opts: WhoamiOptions): Promise<void> {
  const result = await getClient({ apiKey: opts.apiKey, token: opts.token }).andThen((client) => {
    const requestFn = getRequestFn(client);
    return ResultAsync.fromPromise(
      requestFn(WHOAMI_QUERY, {}).then((raw) => {
        const data = raw as WhoamiQueryResult;
        return {
          id: data.viewer.id,
          name: data.viewer.name,
          email: data.viewer.email ?? '',
          workspace: data.organization.name,
        } satisfies WhoamiData;
      }),
      (e) => mapLinearError(e)
    );
  });

  result.match(
    (data) => {
      if (opts.json) {
        printJson(data);
      } else {
        const headers = ['Field', 'Value'];
        const rows: string[][] = [
          ['ID', data.id],
          ['Name', data.name],
          ['Email', data.email],
          ['Workspace', data.workspace],
        ];
        if (process.stdout.isTTY) {
          printTable(prettyTable(headers, rows));
        } else {
          printMarkdown(markdownTable(headers, rows));
        }
      }
    },
    (e) => exitError(e)
  );
}

export function registerWhoami(program: Command): void {
  program
    .command('whoami')
    .description('Show the currently authenticated user')
    .option('--api-key <key>', 'Linear API key')
    .option('--token <token>', 'Linear access token')
    .option('--json', 'Output as JSON')
    .action(async (opts) => {
      await runWhoami({
        apiKey: opts.apiKey,
        token: opts.token,
        json: !!opts.json,
      });
    });
}
