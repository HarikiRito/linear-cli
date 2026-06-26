import { execFileSync } from 'node:child_process';
import { Result, ResultAsync } from 'neverthrow';
import { getClient, getRequestFn } from '../../../lib/client/index.js';
import { coerceCliError, NotFoundError, ValidationError } from '../../../lib/errors.js';
import { exitError } from '../../../lib/runner.js';
import { resolveIssueIdentifier } from '../shared/resolve.js';
import { GET_ISSUE_BRANCH_QUERY } from './queries.js';

export interface BranchIssueOptions {
  apiKey?: string;
  token?: string;
  id: string;
  checkout: boolean;
}

export async function branchIssue(opts: BranchIssueOptions): Promise<void> {
  const clientResult = await getClient({ apiKey: opts.apiKey, token: opts.token });
  if (clientResult.isErr()) {
    exitError(clientResult.error);
    return;
  }
  const client = clientResult.value;

  const idResult = await resolveIssueIdentifier(opts.id, client);
  if (idResult.isErr()) {
    exitError(idResult.error);
    return;
  }
  const resolvedId = idResult.value;

  const requestFn = getRequestFn(client);

  const result = await ResultAsync.fromPromise(
    requestFn(GET_ISSUE_BRANCH_QUERY, { id: resolvedId }).then((data) => {
      const issue = data.issue;
      if (!issue) throw new NotFoundError('issue', resolvedId);
      if (!issue.branchName) throw new ValidationError(`Issue ${resolvedId} has no branch name`);
      return issue.branchName;
    }),
    coerceCliError
  );

  result.match(
    (branchName) => {
      if (opts.checkout) {
        const checkoutResult = Result.fromThrowable(
          () => execFileSync('git', ['checkout', '-b', branchName], { stdio: 'inherit', cwd: process.cwd() }),
          (e) => new ValidationError(`git checkout -b failed: ${e instanceof Error ? e.message : String(e)}`)
        )();
        if (checkoutResult.isErr()) {
          exitError(checkoutResult.error);
        }
        return;
      }
      process.stdout.write(branchName + '\n');
    },
    (e) => exitError(e)
  );
}
