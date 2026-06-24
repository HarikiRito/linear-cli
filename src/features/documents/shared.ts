import { printJson } from '../../lib/output/json.js';
import { markdownTable, printMarkdown } from '../../lib/output/markdown.js';
import { prettyTable, printTable } from '../../lib/output/table.js';

export interface DocumentResult {
  id: string;
  title: string;
  slugId: string;
  content: string | null;
  project: { id: string; name: string } | null;
  updatedAt: string;
}

export function renderDocumentResult(doc: DocumentResult, json: boolean, pretty = false): void {
  if (json) {
    printJson({ document: doc }, pretty);
    return;
  }
  const rows: [string, string][] = [
    ['ID', doc.id],
    ['Title', doc.title],
    ['Slug', doc.slugId],
    ['Project', doc.project?.name ?? ''],
    ['Updated', doc.updatedAt],
  ];
  if (process.stdout.isTTY) {
    printTable(prettyTable(['Field', 'Value'], rows));
  } else {
    printMarkdown(markdownTable(['Field', 'Value'], rows));
  }
}

/** Normalise the SDK updatedAt field which can be Date or string. */
export function normalizeUpdatedAt(updatedAt: Date | string): string {
  return typeof updatedAt === 'string' ? updatedAt : updatedAt.toISOString();
}
