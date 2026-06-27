import { ResultAsync } from 'neverthrow';
import { getClientWithAuthRetry, getRequestFn } from '../../../lib/client/index.js';
import { coerceCliError, NotFoundError } from '../../../lib/errors.js';
import type { PlainField } from '../../../lib/output/plain.js';
import { renderPlainRecord } from '../../../lib/output/plain.js';
import { prettyTable, printTable } from '../../../lib/output/table.js';
import { exitError } from '../../../lib/runner.js';
import { resolveProject } from '../../issues/shared/resolve.js';
import { GET_PROJECT_QUERY } from './queries.js';

export interface GetProjectOptions {
  apiKey?: string;
  token?: string;
  id: string;
  plain: boolean;
}

interface ProjectDetail {
  id: string;
  name: string;
  description: string;
  state: string;
  url: string;
  startDate: string | null;
  targetDate: string | null;
  lead: { id: string; name: string; displayName: string } | null;
  teams: { id: string; name: string; key: string }[];
  members: { id: string; name: string; displayName: string }[];
}

export async function getProject(opts: GetProjectOptions): Promise<void> {
  const clientResult = await getClientWithAuthRetry({ apiKey: opts.apiKey, token: opts.token });
  if (clientResult.isErr()) {
    exitError(clientResult.error);
    return;
  }
  const client = clientResult.value;

  const resolvedResult = await resolveProject(opts.id, client);
  if (resolvedResult.isErr()) {
    exitError(resolvedResult.error);
    return;
  }
  const projectId = resolvedResult.value;
  const requestFn = getRequestFn(client);

  const result = await ResultAsync.fromPromise(
    requestFn(GET_PROJECT_QUERY, { id: projectId }).then((data) => {
      const p = data.project;
      if (!p) throw new NotFoundError('project', opts.id);
      return {
        id: p.id,
        name: p.name,
        description: p.description,
        state: p.state,
        url: p.url,
        startDate: p.startDate ?? null,
        targetDate: p.targetDate ?? null,
        lead: p.lead ? { id: p.lead.id, name: p.lead.name, displayName: p.lead.displayName } : null,
        teams: (p.teams?.nodes ?? []).map((t) => ({ id: t.id, name: t.name, key: t.key })),
        members: (p.members?.nodes ?? []).map((m) => ({
          id: m.id,
          name: m.name,
          displayName: m.displayName,
        })),
      } satisfies ProjectDetail;
    }),
    coerceCliError
  );

  result.match(
    (project) => renderProjectDetail(project, opts.plain),
    (e) => exitError(e)
  );
}

function renderProjectDetail(project: ProjectDetail, plain: boolean): void {
  if (plain) {
    const fields: PlainField[] = [
      { key: 'state', value: project.state },
      { key: 'lead', value: project.lead?.displayName ?? null },
      { key: 'startDate', value: project.startDate },
      { key: 'targetDate', value: project.targetDate },
      { key: 'teams', value: project.teams.map((t) => t.key) },
      { key: 'members', value: String(project.members.length) },
      { key: 'url', value: project.url },
      { key: 'description', value: project.description || null },
    ];
    console.log(renderPlainRecord('Project', project.name, fields));
    return;
  }

  const rows: [string, string][] = [
    ['Name', project.name],
    ['State', project.state],
    ['Lead', project.lead?.displayName ?? ''],
    ['Start Date', project.startDate ?? ''],
    ['Target Date', project.targetDate ?? ''],
    ['Teams', project.teams.map((t) => t.key).join(', ')],
    ['Members', String(project.members.length)],
    ['URL', project.url],
  ];

  printTable(prettyTable(['Field', 'Value'], rows));
  if (project.description) {
    console.log(`\nDescription:\n${project.description}`);
  }
}
