import { readFile } from 'node:fs/promises';
import type { LinearClient } from '@linear/sdk';
import { ResultAsync } from 'neverthrow';
import { getClientWithAuthRetry } from '../../lib/client/index.js';
import { coerceCliError } from '../../lib/errors.js';
import { exitError } from '../../lib/runner.js';
import { readStdin } from '../../lib/stdin.js';
import { type DocumentResult, normalizeUpdatedAt, renderDocumentResult } from './shared.js';

export interface UpdateDocumentOptions {
  apiKey?: string;
  token?: string;
  id: string;
  title?: string;
  content?: string;
  contentFile?: string;
  plain: boolean;
}

async function doUpdate(
  client: LinearClient,
  opts: UpdateDocumentOptions,
  content: string | undefined
): Promise<DocumentResult> {
  const input: Record<string, unknown> = {};
  if (opts.title !== undefined) input.title = opts.title;
  if (content !== undefined) input.content = content;

  const payload = await client.updateDocument(opts.id, input);
  const doc = await payload.document;
  if (!doc) throw new Error('updateDocument returned no document');

  const project = await doc.project;

  return {
    id: doc.id,
    title: doc.title,
    slugId: doc.slugId,
    content: doc.content ?? null,
    project: project ? { id: project.id, name: project.name } : null,
    updatedAt: normalizeUpdatedAt(doc.updatedAt),
  };
}

export async function updateDocument(opts: UpdateDocumentOptions): Promise<void> {
  let content = opts.content;
  if (content === '-') {
    content = await readStdin();
  } else if (opts.contentFile !== undefined) {
    content = await readFile(opts.contentFile, 'utf-8');
  }

  const clientResult = await getClientWithAuthRetry({ apiKey: opts.apiKey, token: opts.token });
  if (clientResult.isErr()) {
    exitError(clientResult.error);
    return;
  }
  const client = clientResult.value;

  const result = await ResultAsync.fromPromise(doUpdate(client, opts, content), coerceCliError);

  result.match(
    (doc) => renderDocumentResult(doc, opts.plain),
    (e) => exitError(e)
  );
}
