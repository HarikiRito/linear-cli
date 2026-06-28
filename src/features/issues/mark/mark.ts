import type { LinearClient } from '@linear/sdk';
import { LinearDocument } from '@linear/sdk';
import { ResultAsync } from 'neverthrow';
import { getClientWithAuthRetry } from '../../../lib/client/index.js';
import { coerceCliError, ValidationError } from '../../../lib/errors.js';
import { exitError } from '../../../lib/runner.js';
import { resolveIssueIdentifier } from '../shared/resolve.js';

export const VALID_RELATIONS = [
  'related-to',
  'blocked-by',
  'blocking',
  'duplicate-of',
  'parent-of',
  'sub-issue-of',
] as const;

export type RelationType = (typeof VALID_RELATIONS)[number];

export interface MarkOptions {
  apiKey?: string;
  token?: string;
  relation: string;
  issue: string;
  target: string;
}

async function doMark(client: LinearClient, opts: MarkOptions): Promise<void> {
  const [issueResult, targetResult] = await Promise.all([
    resolveIssueIdentifier(opts.issue, client),
    resolveIssueIdentifier(opts.target, client),
  ]);
  if (issueResult.isErr()) throw issueResult.error;
  if (targetResult.isErr()) throw targetResult.error;
  const issueId = issueResult.value;
  const targetId = targetResult.value;

  const relation = opts.relation as RelationType;

  switch (relation) {
    case 'related-to':
      await client.createIssueRelation({
        issueId,
        relatedIssueId: targetId,
        type: LinearDocument.IssueRelationType.Related,
      });
      break;
    case 'blocking':
      await client.createIssueRelation({
        issueId,
        relatedIssueId: targetId,
        type: LinearDocument.IssueRelationType.Blocks,
      });
      break;
    case 'blocked-by':
      // Swap ids: the target is the blocker, our issue is the blocked one
      await client.createIssueRelation({
        issueId: targetId,
        relatedIssueId: issueId,
        type: LinearDocument.IssueRelationType.Blocks,
      });
      break;
    case 'duplicate-of':
      await client.createIssueRelation({
        issueId,
        relatedIssueId: targetId,
        type: LinearDocument.IssueRelationType.Duplicate,
      });
      break;
    case 'parent-of':
      // A is parent-of B => set B.parentId = A
      await client.updateIssue(targetId, { parentId: issueId });
      break;
    case 'sub-issue-of':
      // A is sub-issue-of B => set A.parentId = B
      await client.updateIssue(issueId, { parentId: targetId });
      break;
  }

  console.log(`Relation '${opts.relation}' set between ${opts.issue} and ${opts.target}.`);
}

export async function markRelation(opts: MarkOptions): Promise<void> {
  if (!VALID_RELATIONS.includes(opts.relation as RelationType)) {
    exitError(
      new ValidationError(
        `Invalid relation type '${opts.relation}'. Valid values: ${VALID_RELATIONS.join(', ')}`
      )
    );
    return;
  }

  const clientResult = await getClientWithAuthRetry({ apiKey: opts.apiKey, token: opts.token });
  if (clientResult.isErr()) {
    exitError(clientResult.error);
    return;
  }
  const client = clientResult.value;

  const result = await ResultAsync.fromPromise(doMark(client, opts), coerceCliError);
  result.match(
    () => {},
    (e) => exitError(e)
  );
}
