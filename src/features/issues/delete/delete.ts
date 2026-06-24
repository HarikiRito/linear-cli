import { ResultAsync } from 'neverthrow';
import { getClient } from '../../../lib/client/index.js';
import { confirmDestructive } from '../../../lib/confirm.js';
import { mapLinearError } from '../../../lib/errors.js';
import { exitError } from '../../../lib/runner.js';

export interface DeleteIssueOptions {
  apiKey?: string;
  token?: string;
  id: string;
  yes: boolean;
}

export async function deleteIssue(opts: DeleteIssueOptions): Promise<void> {
  const { proceed, error } = await confirmDestructive(`Delete issue ${opts.id}?`, opts.yes);
  if (error) {
    exitError(error);
    return;
  }
  if (!proceed) {
    console.log('Aborted.');
    return;
  }

  const clientResult = await getClient({ apiKey: opts.apiKey, token: opts.token });
  if (clientResult.isErr()) {
    exitError(clientResult.error);
    return;
  }
  const client = clientResult.value;

  const result = await ResultAsync.fromPromise(client.deleteIssue(opts.id), (e) =>
    mapLinearError(e)
  );

  result.match(
    () => {
      console.log(`Issue ${opts.id} deleted.`);
    },
    (e) => exitError(e)
  );
}
