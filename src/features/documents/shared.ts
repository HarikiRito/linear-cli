import type { PlainField } from '../../lib/output/plain.js';
import { renderPlainRecord } from '../../lib/output/plain.js';
import { prettyTable, printTable } from '../../lib/output/table.js';

export interface DocumentResult {
  id: string;
  title: string;
  slugId: string;
  content: string | null;
  project: { id: string; name: string } | null;
  updatedAt: string;
}

export function renderDocumentResult(doc: DocumentResult, plain: boolean): void {
  if (plain) {
    const fields: PlainField[] = [
      { key: 'id', value: doc.id },
      { key: 'slugId', value: doc.slugId },
      { key: 'project', value: doc.project?.name ?? null },
      { key: 'updatedAt', value: doc.updatedAt },
      { key: 'content', value: doc.content },
    ];
    console.log(renderPlainRecord('Document', doc.title, fields));
    return;
  }
  const rows: [string, string][] = [
    ['Title', doc.title],
    ['Slug', doc.slugId],
    ['Project', doc.project?.name ?? ''],
    ['Updated', doc.updatedAt],
  ];
  printTable(prettyTable(['Field', 'Value'], rows));
  if (doc.content) {
    console.log(`\nContent:\n${doc.content}`);
  }
}

/** Normalise the SDK updatedAt field which can be Date or string. */
export function normalizeUpdatedAt(updatedAt: Date | string): string {
  return typeof updatedAt === 'string' ? updatedAt : updatedAt.toISOString();
}
