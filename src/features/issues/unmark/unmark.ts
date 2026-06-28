import { ResultAsync } from 'neverthrow';
import { getClientWithAuthRetry } from '../../../lib/client/index.js';
import { mapLinearError } from '../../../lib/errors.js';
import { exitError } from '../../../lib/runner.js';

export interface UnmarkOptions {
  apiKey?: string;
  token?: string;
  relationId: string;
}

export async function unmarkRelation(opts: UnmarkOptions): Promise<void> {
  const clientResult = await getClientWithAuthRetry({ apiKey: opts.apiKey, token: opts.token });
  if (clientResult.isErr()) {
    exitError(clientResult.error);
    return;
  }
  const client = clientResult.value;

  const result = await ResultAsync.fromPromise(
    client.deleteIssueRelation(opts.relationId),
    (e) => mapLinearError(e)
  );

  result.match(
    () => {
      console.log(`Relation ${opts.relationId} removed.`);
    },
    (e) => exitError(e)
  );
}
