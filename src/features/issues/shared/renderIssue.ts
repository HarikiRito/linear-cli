import { printJson } from '../../../lib/output/json.js';
import { markdownTable, printMarkdown } from '../../../lib/output/markdown.js';
import { prettyTable, printTable } from '../../../lib/output/table.js';

export interface IssueResult {
  id: string;
  identifier: string;
  title: string;
  url: string;
  state: string;
}

/** Raw issue node shape returned by issueCreate / issueUpdate mutations. */
export interface IssueNode {
  id: string;
  identifier: string;
  title: string;
  url: string;
  state: { name: string };
}

const COLUMNS = ['ID', 'Identifier', 'Title', 'URL', 'State'];
const toRowArr = (i: IssueResult): string[] => [i.id, i.identifier, i.title, i.url, i.state];

export function renderIssue(issue: IssueResult, json: boolean): void {
  if (json) {
    printJson({ issue });
  } else if (process.stdout.isTTY) {
    printTable(prettyTable(COLUMNS, [toRowArr(issue)]));
  } else {
    printMarkdown(markdownTable(COLUMNS, [toRowArr(issue)]));
  }
}

export function extractIssue(raw: IssueNode): IssueResult {
  return {
    id: raw.id,
    identifier: raw.identifier,
    title: raw.title,
    url: raw.url,
    state: raw.state.name,
  };
}

export function extractIssueCreate(data: { issueCreate: { issue: IssueNode } }): IssueResult {
  return extractIssue(data.issueCreate.issue);
}

export function extractIssueUpdate(data: { issueUpdate: { issue: IssueNode } }): IssueResult {
  return extractIssue(data.issueUpdate.issue);
}
