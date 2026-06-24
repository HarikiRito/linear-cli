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
