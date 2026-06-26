import type { PlainField } from '../../lib/output/plain.js';
import { renderPlainRecord } from '../../lib/output/plain.js';
import { prettyTable, printTable } from '../../lib/output/table.js';

export interface MilestoneResult {
  id: string;
  name: string;
  targetDate: string | null;
  description: string | null;
  project: { id: string; name: string } | null;
}

export function renderMilestoneResult(milestone: MilestoneResult, plain: boolean): void {
  if (plain) {
    const fields: PlainField[] = [
      { key: 'id', value: milestone.id },
      { key: 'targetDate', value: milestone.targetDate },
      { key: 'description', value: milestone.description },
      { key: 'project', value: milestone.project?.name ?? null },
    ];
    console.log(renderPlainRecord('Milestone', milestone.name, fields));
    return;
  }
  const rows: [string, string][] = [
    ['Name', milestone.name],
    ['Target Date', milestone.targetDate ?? ''],
    ['Project', milestone.project?.name ?? ''],
  ];
  printTable(prettyTable(['Field', 'Value'], rows));
}
