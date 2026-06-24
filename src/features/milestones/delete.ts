import { ResultAsync } from 'neverthrow';
import { getClient } from '../../lib/client/index.js';
import { confirmDestructive } from '../../lib/confirm.js';
import { mapLinearError } from '../../lib/errors.js';
import { printJson } from '../../lib/output/json.js';
import { exitError } from '../../lib/runner.js';

export interface DeleteMilestoneOptions {
  apiKey?: string;
  token?: string;
  id: string;
  yes: boolean;
  json: boolean;
  pretty: boolean;
}

export async function deleteMilestone(opts: DeleteMilestoneOptions): Promise<void> {
  const { proceed, error } = await confirmDestructive(`Delete milestone ${opts.id}?`, opts.yes);
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

  const result = await ResultAsync.fromPromise(client.deleteProjectMilestone(opts.id), (e) =>
    mapLinearError(e)
  );

  result.match(
    () => {
      if (opts.json) {
        printJson({ success: true }, opts.pretty);
      } else {
        console.log(`Milestone ${opts.id} deleted.`);
      }
    },
    (e) => exitError(e)
  );
}
