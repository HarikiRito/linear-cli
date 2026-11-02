import { readFile } from 'node:fs/promises';
import { type LinearClient, LinearDocument } from '@linear/sdk';
import { err, ok, okAsync, type Result, ResultAsync } from 'neverthrow';
import { getClientWithAuthRetry } from '../../../lib/client/index.js';
import { coerceCliError, toError, ValidationError } from '../../../lib/errors.js';
import { renderPlainRecord } from '../../../lib/output/plain.js';
import { prettyTable, printTable } from '../../../lib/output/table.js';
import { exitError } from '../../../lib/runner.js';
import { readStdin } from '../../../lib/stdin.js';
import { uploadFile } from '../../../lib/upload.js';
import { resolveProject } from '../../issues/shared/resolve.js';

const HEALTHS = Object.values(LinearDocument.ProjectUpdateHealthType);

export interface CreateProjectUpdateOptions {
  apiKey?: string;
  token?: string;
  project: string;
  health: string;
  body?: string;
  bodyFile?: string;
  attach: string[];
  plain: boolean;
}

interface ProjectUpdateResult {
  id: string;
  health: string;
  url: string;
}

function validateInput(opts: CreateProjectUpdateOptions): Result<void, ValidationError> {
  if (!HEALTHS.includes(opts.health as LinearDocument.ProjectUpdateHealthType)) {
    return err(
      new ValidationError(`Invalid --health "${opts.health}". Allowed: ${HEALTHS.join(', ')}`)
    );
  }
  if ((opts.body === undefined) === (opts.bodyFile === undefined)) {
    return err(new ValidationError('Provide exactly one of --body or --body-file'));
  }
  return ok(undefined);
}

function readRaw(opts: CreateProjectUpdateOptions): ResultAsync<string, Error> {
  if (opts.bodyFile !== undefined) {
    return ResultAsync.fromPromise(
      readFile(opts.bodyFile, 'utf8'),
      (e) => new Error(`Cannot read --body-file ${opts.bodyFile}: ${toError(e).message}`)
    );
  }
  if (opts.body === '-') return ResultAsync.fromPromise(readStdin(), toError);
  return okAsync(opts.body ?? '');
}

function readBody(opts: CreateProjectUpdateOptions): ResultAsync<string, Error> {
  return readRaw(opts).andThen((body) =>
    body.trim() ? ok(body) : err(new ValidationError('Update body must not be empty'))
  );
}

function uploadAll(client: LinearClient, paths: string[]): ResultAsync<string[], Error> {
  return ResultAsync.fromSafePromise(uploadSequentially(client, paths)).andThen((r) => r);
}

async function uploadSequentially(
  client: LinearClient,
  paths: string[]
): Promise<Result<string[], Error>> {
  const lines: string[] = [];
  for (const path of paths) {
    const uploaded = await ResultAsync.fromPromise(uploadFile(client, path), toError).andThen(
      (r) => r
    );
    if (uploaded.isErr()) {
      return err(new Error(`Failed to upload ${path}: ${uploaded.error.message}`));
    }
    lines.push(`  [${uploaded.value.filename}](${uploaded.value.assetUrl})`);
  }
  return ok(lines);
}

function withAttachments(body: string, lines: string[]): string {
  return lines.length ? `${body}\n\n${lines.join('\n')}` : body;
}

async function post(
  client: LinearClient,
  projectId: string,
  body: string,
  health: LinearDocument.ProjectUpdateHealthType
): Promise<ProjectUpdateResult> {
  const payload = await client.createProjectUpdate({
    projectId,
    body,
    health,
  });
  const update = await payload.projectUpdate;
  if (!payload.success || !update) throw new Error('createProjectUpdate returned no update');
  return { id: update.id, health: update.health, url: update.url };
}

function renderResult(u: ProjectUpdateResult, plain: boolean): void {
  if (plain) {
    console.log(
      renderPlainRecord('ProjectUpdate', u.id, [
        { key: 'health', value: u.health },
        { key: 'url', value: u.url },
      ])
    );
    return;
  }
  printTable(
    prettyTable(
      ['Field', 'Value'],
      [
        ['ID', u.id],
        ['Health', u.health],
        ['URL', u.url],
      ]
    )
  );
}

export async function createProjectUpdate(opts: CreateProjectUpdateOptions): Promise<void> {
  const valid = validateInput(opts);
  if (valid.isErr()) {
    exitError(valid.error);
    return;
  }

  const clientResult = await getClientWithAuthRetry({ apiKey: opts.apiKey, token: opts.token });
  if (clientResult.isErr()) {
    exitError(clientResult.error);
    return;
  }
  const client = clientResult.value;

  const result = await readBody(opts)
    .andThen((body) =>
      resolveProject(opts.project, client).map((projectId) => ({ body, projectId }))
    )
    .andThen(({ body, projectId }) =>
      uploadAll(client, opts.attach).map((lines) => ({
        body: withAttachments(body, lines),
        projectId,
      }))
    )
    .andThen(({ body, projectId }) =>
      ResultAsync.fromPromise(
        post(client, projectId, body, opts.health as LinearDocument.ProjectUpdateHealthType),
        coerceCliError
      )
    );

  result.match(
    (u) => renderResult(u, opts.plain),
    (e) => exitError(e)
  );
}
