import { renderPlainRecord } from '../../../lib/output/plain.js';
import { prettyTable, printTable } from '../../../lib/output/table.js';

export interface IssueResult {
  id: string;
  identifier: string;
  title: string;
  url: string;
  state: string;
}

const COLUMNS = ['Identifier', 'Title', 'URL', 'State'];
const toRowArr = (i: IssueResult): string[] => [i.identifier, i.title, i.url, i.state];

export function renderIssue(issue: IssueResult, plain: boolean): void {
  if (plain) {
    console.log(
      renderPlainRecord('Issue', issue.identifier, [
        { key: 'id', value: issue.id },
        { key: 'title', value: issue.title },
        { key: 'state', value: issue.state },
        { key: 'url', value: issue.url },
      ])
    );
    return;
  }
  printTable(prettyTable(COLUMNS, [toRowArr(issue)]));
}
