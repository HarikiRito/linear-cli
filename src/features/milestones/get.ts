import { ResultAsync } from 'neverthrow';
import { getClient, getRequestFn } from '../../lib/client/index.js';
import { coerceCliError, NotFoundError } from '../../lib/errors.js';
import { printJson } from '../../lib/output/json.js';
import { markdownTable, printMarkdown } from '../../lib/output/markdown.js';
import { prettyTable, printTable } from '../../lib/output/table.js';
import { exitError } from '../../lib/runner.js';
import { GET_PROJECT_MILESTONE_QUERY } from './queries.js';

export interface GetMilestoneOptions {
  apiKey?: string;
  token?: string;
  id: string;
  json: boolean;
  pretty: boolean;
}

interface MilestoneDetail {
  id: string;
  name: string;
  targetDate: string | null;
  description: string | null;
  progress: number;
  sortOrder: number;
  project: { id: string; name: string } | null;
}

export async function getMilestone(opts: GetMilestoneOptions): Promise<void> {
  const clientResult = await getClient({ apiKey: opts.apiKey, token: opts.token });
  if (clientResult.isErr()) {
    exitError(clientResult.error);
    return;
  }
  const client = clientResult.value;
  const requestFn = getRequestFn(client);

  const result = await ResultAsync.fromPromise(
    requestFn(GET_PROJECT_MILESTONE_QUERY, { id: opts.id }).then((data) => {
      const m = data.projectMilestone;
      if (!m) throw new NotFoundError('milestone', opts.id);
      return {
        id: m.id,
        name: m.name,
        targetDate: m.targetDate ?? null,
        description: m.description ?? null,
        progress: m.progress,
        sortOrder: m.sortOrder,
        project: m.project ? { id: m.project.id, name: m.project.name } : null,
      } satisfies MilestoneDetail;
    }),
    coerceCliError
  );

  result.match(
    (milestone) => renderMilestoneDetail(milestone, opts.json, opts.pretty),
    (e) => exitError(e)
  );
}

function renderMilestoneDetail(m: MilestoneDetail, json: boolean, pretty = false): void {
  if (json) {
    printJson({ milestone: m }, pretty);
    return;
  }

  const rows: [string, string][] = [
    ['ID', m.id],
    ['Name', m.name],
    ['Target Date', m.targetDate ?? ''],
    ['Description', m.description ?? ''],
    ['Progress', `${m.progress}`],
    ['Sort Order', `${m.sortOrder}`],
    ['Project', m.project?.name ?? ''],
  ];

  if (process.stdout.isTTY) {
    printTable(prettyTable(['Field', 'Value'], rows));
  } else {
    printMarkdown(markdownTable(['Field', 'Value'], rows));
  }
}
