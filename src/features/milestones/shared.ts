import { printJson } from '../../lib/output/json.js';
import { markdownTable, printMarkdown } from '../../lib/output/markdown.js';
import { prettyTable, printTable } from '../../lib/output/table.js';

export interface MilestoneResult {
  id: string;
  name: string;
  targetDate: string | null;
  description: string | null;
  project: { id: string; name: string } | null;
}

export function renderMilestoneResult(milestone: MilestoneResult, json: boolean): void {
  if (json) {
    printJson({ milestone });
    return;
  }
  const rows: [string, string][] = [
    ['ID', milestone.id],
    ['Name', milestone.name],
    ['Target Date', milestone.targetDate ?? ''],
    ['Project', milestone.project?.name ?? ''],
  ];
  if (process.stdout.isTTY) {
    printTable(prettyTable(['Field', 'Value'], rows));
  } else {
    printMarkdown(markdownTable(['Field', 'Value'], rows));
  }
}
