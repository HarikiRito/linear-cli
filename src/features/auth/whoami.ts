import type { Command } from 'commander';
import { ResultAsync } from 'neverthrow';
import { getClient } from '../../lib/client/index.js';
import { mapLinearError } from '../../lib/errors.js';
import { printJson } from '../../lib/output/json.js';
import { markdownTable, printMarkdown } from '../../lib/output/markdown.js';
import { exitError } from '../../lib/runner.js';

interface ViewerData {
  id: string;
  name: string;
  email: string;
}

export interface WhoamiOptions {
  apiKey?: string;
  token?: string;
  json: boolean;
}

export async function runWhoami(opts: WhoamiOptions): Promise<void> {
  const result = await getClient({ apiKey: opts.apiKey, token: opts.token }).andThen((client) =>
    ResultAsync.fromPromise(
      Promise.resolve(client.viewer).then(
        (v) =>
          ({
            id: v.id,
            name: v.name,
            email: v.email ?? '',
          }) satisfies ViewerData
      ),
      (e) => mapLinearError(e)
    )
  );

  result.match(
    (data) => {
      if (opts.json) {
        printJson(data);
      } else {
        const table = markdownTable(
          ['Field', 'Value'],
          [
            ['ID', data.id],
            ['Name', data.name],
            ['Email', data.email],
          ]
        );
        printMarkdown(table);
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
