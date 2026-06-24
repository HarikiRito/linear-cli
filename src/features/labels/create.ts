import type { LinearClient } from '@linear/sdk';
import { ResultAsync } from 'neverthrow';
import { getClient } from '../../lib/client/index.js';
import { coerceCliError } from '../../lib/errors.js';
import { printJson } from '../../lib/output/json.js';
import { markdownTable, printMarkdown } from '../../lib/output/markdown.js';
import { prettyTable, printTable } from '../../lib/output/table.js';
import { exitError } from '../../lib/runner.js';
import { resolveTeam } from '../issues/shared/resolve.js';

export interface CreateLabelOptions {
  apiKey?: string;
  token?: string;
  name: string;
  color?: string;
  team?: string;
  description?: string;
  json: boolean;
}

interface LabelResult {
  id: string;
  name: string;
  color: string;
  teamId: string | null;
}

async function resolveAndCreate(
  client: LinearClient,
  opts: CreateLabelOptions
): Promise<LabelResult> {
  const input: Record<string, unknown> = { name: opts.name };
  if (opts.color !== undefined) input.color = opts.color;
  if (opts.description !== undefined) input.description = opts.description;

  if (opts.team !== undefined) {
    const teamResult = await resolveTeam(opts.team, client);
    if (teamResult.isErr()) throw teamResult.error;
    input.teamId = teamResult.value;
  }

  const payload = await client.createIssueLabel(
    input as Parameters<typeof client.createIssueLabel>[0]
  );
  const label = await payload.issueLabel;
  if (!label) throw new Error('createIssueLabel returned no label');

  const team = await label.team;

  return {
    id: label.id,
    name: label.name,
    color: label.color,
    teamId: team?.id ?? null,
  };
}

export async function createLabel(opts: CreateLabelOptions): Promise<void> {
  const clientResult = await getClient({ apiKey: opts.apiKey, token: opts.token });
  if (clientResult.isErr()) {
    exitError(clientResult.error);
    return;
  }
  const client = clientResult.value;

  const result = await ResultAsync.fromPromise(resolveAndCreate(client, opts), coerceCliError);

  result.match(
    (label) => {
      if (opts.json) {
        printJson({ label });
        return;
      }
      const rows: [string, string][] = [
        ['ID', label.id],
        ['Name', label.name],
        ['Color', label.color],
        ['Team ID', label.teamId ?? '(workspace)'],
      ];
      if (process.stdout.isTTY) {
        printTable(prettyTable(['Field', 'Value'], rows));
      } else {
        printMarkdown(markdownTable(['Field', 'Value'], rows));
      }
    },
    (e) => exitError(e)
  );
}
