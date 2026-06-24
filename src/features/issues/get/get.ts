import { ResultAsync } from 'neverthrow';
import { getClient, getRequestFn } from '../../../lib/client/index.js';
import { coerceCliError, NotFoundError } from '../../../lib/errors.js';
import { printJson } from '../../../lib/output/json.js';
import { markdownTable, printMarkdown } from '../../../lib/output/markdown.js';
import { prettyTable, printTable } from '../../../lib/output/table.js';
import { exitError } from '../../../lib/runner.js';
import { GET_ISSUE_QUERY } from './queries.js';

export interface GetIssueOptions {
  apiKey?: string;
  token?: string;
  id: string;
  json: boolean;
}

interface AttachmentRow {
  title: string;
  url: string;
}

interface IssueDetail {
  id: string;
  identifier: string;
  title: string;
  description: string | null;
  url: string;
  branchName: string;
  priority: number;
  estimate: number | null;
  dueDate: string | null;
  createdAt: string;
  state: { id: string; name: string; type: string } | null;
  assignee: { id: string; name: string; displayName: string; email: string } | null;
  labels: { id: string; name: string; color: string }[];
  project: { id: string; name: string } | null;
  parent: { id: string; identifier: string; title: string } | null;
  children: { id: string; identifier: string; title: string }[];
  attachments: AttachmentRow[];
}

export async function getIssue(opts: GetIssueOptions): Promise<void> {
  const clientResult = await getClient({ apiKey: opts.apiKey, token: opts.token });
  if (clientResult.isErr()) {
    exitError(clientResult.error);
    return;
  }
  const client = clientResult.value;
  const requestFn = getRequestFn(client);

  const result = await ResultAsync.fromPromise(
    requestFn(GET_ISSUE_QUERY, { id: opts.id }).then((data) => {
      const issue = data.issue;
      if (!issue) throw new NotFoundError('issue', opts.id);
      return {
        id: issue.id,
        identifier: issue.identifier,
        title: issue.title,
        description: issue.description ?? null,
        url: issue.url,
        branchName: issue.branchName,
        priority: issue.priority,
        estimate: issue.estimate ?? null,
        dueDate: issue.dueDate ?? null,
        createdAt: issue.createdAt,
        state: issue.state
          ? { id: issue.state.id, name: issue.state.name, type: issue.state.type }
          : null,
        assignee: issue.assignee
          ? {
              id: issue.assignee.id,
              name: issue.assignee.name,
              displayName: issue.assignee.displayName,
              email: issue.assignee.email,
            }
          : null,
        labels: (issue.labels?.nodes ?? []).map((l) => ({
          id: l.id,
          name: l.name,
          color: l.color,
        })),
        project: issue.project ? { id: issue.project.id, name: issue.project.name } : null,
        parent: issue.parent
          ? { id: issue.parent.id, identifier: issue.parent.identifier, title: issue.parent.title }
          : null,
        children: (issue.children?.nodes ?? []).map((c) => ({
          id: c.id,
          identifier: c.identifier,
          title: c.title,
        })),
        attachments: (issue.attachments?.nodes ?? []).map((a) => ({
          title: a.title,
          url: a.url,
        })),
      } satisfies IssueDetail;
    }),
    coerceCliError
  );

  result.match(
    (issue) => renderIssueDetail(issue, opts.json),
    (e) => exitError(e)
  );
}

function renderIssueDetail(issue: IssueDetail, json: boolean): void {
  if (json) {
    printJson({ issue });
    return;
  }

  const rows: [string, string][] = [
    ['Identifier', issue.identifier],
    ['Title', issue.title],
    ['State', issue.state?.name ?? ''],
    ['Assignee', issue.assignee?.displayName ?? ''],
    ['Labels', issue.labels.map((l) => l.name).join(', ')],
    ['Project', issue.project?.name ?? ''],
    ['Priority', String(issue.priority)],
    ['Estimate', issue.estimate !== null ? String(issue.estimate) : ''],
    ['Due Date', issue.dueDate ?? ''],
    ['Branch', issue.branchName],
    ['Parent', issue.parent ? `${issue.parent.identifier}: ${issue.parent.title}` : ''],
    ['Children', issue.children.map((c) => c.identifier).join(', ')],
    ['URL', issue.url],
    ['Created', issue.createdAt],
  ];

  if (process.stdout.isTTY) {
    printTable(prettyTable(['Field', 'Value'], rows));
  } else {
    printMarkdown(markdownTable(['Field', 'Value'], rows));
    if (issue.description) {
      printMarkdown(`\n## Description\n\n${issue.description}`);
    }
  }
}
