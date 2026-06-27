import { readFile } from 'node:fs/promises';
import type { LinearClient } from '@linear/sdk';
import { ResultAsync } from 'neverthrow';
import { getClientWithAuthRetry } from '../../lib/client/index.js';
import { coerceCliError } from '../../lib/errors.js';
import { exitError } from '../../lib/runner.js';
import { readStdin } from '../../lib/stdin.js';
import { resolveProject } from '../issues/shared/resolve.js';
import { type DocumentResult, normalizeUpdatedAt, renderDocumentResult } from './shared.js';

export interface CreateDocumentOptions {
  apiKey?: string;
  token?: string;
  title: string;
  content?: string;
  contentFile?: string;
  project?: string;
  plain: boolean;
}

async function doCreate(
  client: LinearClient,
  opts: CreateDocumentOptions,
  content: string | undefined
): Promise<DocumentResult> {
  const input: Record<string, unknown> = { title: opts.title };

  if (opts.project !== undefined) {
    const projectResult = await resolveProject(opts.project, client);
    if (projectResult.isErr()) throw projectResult.error;
    input.projectId = projectResult.value;
  }

  if (content !== undefined) input.content = content;

  const payload = await client.createDocument(input as Parameters<typeof client.createDocument>[0]);
  const doc = await payload.document;
  if (!doc) throw new Error('createDocument returned no document');

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

export async function createDocument(opts: CreateDocumentOptions): Promise<void> {
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

  const result = await ResultAsync.fromPromise(doCreate(client, opts, content), coerceCliError);

  result.match(
    (doc) => renderDocumentResult(doc, opts.plain),
    (e) => exitError(e)
  );
}
