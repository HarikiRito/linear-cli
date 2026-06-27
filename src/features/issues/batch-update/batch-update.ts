import { getClient } from '../../../lib/client/index.js';
import { parseCsv } from '../../../lib/commandOptions.js';
import { validatePriority, ValidationError } from '../../../lib/errors.js';
import { renderPlainList } from '../../../lib/output/plain.js';
import { prettyTable, printTable } from '../../../lib/output/table.js';
import { exitError } from '../../../lib/runner.js';
import { readStdin } from '../../../lib/stdin.js';
import { resolveIssueIdentifier } from '../shared/resolve.js';
import type { IssueResult } from '../shared/renderIssue.js';
import { resolveUpdateInput, type UpdateIssueOptions } from '../update/update.js';

export interface BatchUpdateOptions extends Omit<UpdateIssueOptions, 'id'> {
  ids: string[];
}

export type IssueUpdateResult =
  | { ok: true; issue: IssueResult }
  | { ok: false; id: string; error: string };

export const BATCH_CHUNK_SIZE = 5;

/**
 * Parse variadic ID args, splitting on commas within each arg, then deduplicating.
 * e.g. ["ENG-1", "ENG-2,ENG-3"] => ["ENG-1", "ENG-2", "ENG-3"]
 */
export function parseIds(args: string[]): string[] {
  const ids = args.flatMap((arg) => parseCsv(arg));
  return [...new Set(ids)];
}

export function formatSummary(results: IssueUpdateResult[]): string {
  const succeeded = results.filter((r) => r.ok).length;
  const failed = results.length - succeeded;
  return `${succeeded} updated, ${failed} failed`;
}

/**
 * Run updates for the given IDs using bounded concurrency (chunk size BATCH_CHUNK_SIZE).
 * The updateFn is called per ID; exported for unit testing.
 */
export async function runBatchUpdate(
  ids: string[],
  updateFn: (id: string) => Promise<IssueUpdateResult>
): Promise<IssueUpdateResult[]> {
  const results: IssueUpdateResult[] = [];
  for (let i = 0; i < ids.length; i += BATCH_CHUNK_SIZE) {
    const chunk = ids.slice(i, i + BATCH_CHUNK_SIZE);
    const chunkResults = await Promise.all(chunk.map(updateFn));
    results.push(...chunkResults);
  }
  return results;
}

function renderResults(results: IssueUpdateResult[], plain: boolean): void {
  if (plain) {
    const records = results.map((r) => {
      if (r.ok) {
        return {
          primaryId: r.issue.identifier,
          fields: [
            { key: 'title', value: r.issue.title },
            { key: 'state', value: r.issue.state },
            { key: 'result', value: 'updated' },
          ],
        };
      }
      return {
        primaryId: r.id,
        fields: [{ key: 'error', value: r.error }],
      };
    });
    console.log(renderPlainList('Issue', records));
  } else {
    const rows = results.map((r) => {
      if (r.ok) {
        return [r.issue.identifier, r.issue.title, r.issue.state, 'updated'];
      }
      return [r.id, '', '', r.error];
    });
    printTable(prettyTable(['ID', 'Title', 'State', 'Result/Error'], rows));
  }
  console.log(formatSummary(results));
}

export async function batchUpdateIssues(opts: BatchUpdateOptions): Promise<void> {
  const ids = parseIds(opts.ids);

  if (ids.length === 0) {
    exitError(new ValidationError('At least one issue ID is required'));
    return;
  }

  const priorityErr = validatePriority(opts.priority);
  if (priorityErr) {
    exitError(priorityErr);
    return;
  }

  const resolvedDescription = opts.description === '-' ? await readStdin() : opts.description;

  const clientResult = await getClient({ apiKey: opts.apiKey, token: opts.token });
  if (clientResult.isErr()) {
    exitError(clientResult.error);
    return;
  }
  const client = clientResult.value;

  // Resolve all shared fields once — avoids N redundant API lookups across the batch.
  const inputResult = await resolveUpdateInput(client, opts, resolvedDescription);
  if (inputResult.isErr()) {
    exitError(inputResult.error);
    return;
  }
  const sharedInput = inputResult.value;

  const results = await runBatchUpdate(ids, async (id): Promise<IssueUpdateResult> => {
    const idResult = await resolveIssueIdentifier(id, client);
    if (idResult.isErr()) {
      return { ok: false, id, error: idResult.error.message };
    }
    const resolvedId = idResult.value;

    try {
      const payload = await client.updateIssue(resolvedId, sharedInput);
      const issue = await payload.issue;
      if (!issue) return { ok: false, id, error: 'updateIssue returned no issue' };

      const stateObj = await issue.state;
      return {
        ok: true,
        issue: {
          id: issue.id,
          identifier: issue.identifier,
          title: issue.title,
          url: issue.url,
          state: stateObj?.name ?? '',
        },
      };
    } catch (e) {
      return { ok: false, id, error: e instanceof Error ? e.message : String(e) };
    }
  });

  renderResults(results, opts.plain);

  if (results.some((r) => !r.ok)) {
    process.exitCode = 1;
  }
}
