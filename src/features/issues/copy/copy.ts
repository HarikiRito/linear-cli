import { ResultAsync } from 'neverthrow';
import { getClientWithAuthRetry, getRequestFn } from '../../../lib/client/index.js';
import { coerceCliError, NotFoundError } from '../../../lib/errors.js';
import { exitError } from '../../../lib/runner.js';
import { resolveIssueIdentifier } from '../shared/resolve.js';
import { ISSUE_COPY_QUERY } from './queries.js';

export interface CopyOptions {
  apiKey?: string;
  token?: string;
  id: string;
  url?: boolean;
  identifier?: boolean;
  branch?: boolean;
}

export async function copyIssue(opts: CopyOptions): Promise<void> {
  const clientResult = await getClientWithAuthRetry({ apiKey: opts.apiKey, token: opts.token });
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
    requestFn(ISSUE_COPY_QUERY, { id: resolvedId }).then((data) => {
      const issue = data.issue;
      if (!issue) throw new NotFoundError('issue', resolvedId);
      return issue;
    }),
    coerceCliError
  );

  result.match(
    (issue) => {
      if (opts.url || opts.identifier || opts.branch) {
        if (opts.url) console.log(issue.url);
        if (opts.identifier) console.log(issue.identifier);
        if (opts.branch) console.log(issue.branchName);
      } else {
        console.log(`identifier: ${issue.identifier}`);
        console.log(`url: ${issue.url}`);
        console.log(`branch: ${issue.branchName}`);
      }
    },
    (e) => exitError(e)
  );
}
