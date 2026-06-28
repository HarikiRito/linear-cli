import { ResultAsync } from 'neverthrow';
import { getClientWithAuthRetry } from '../../../lib/client/index.js';
import { confirmDestructive } from '../../../lib/confirm.js';
import { mapLinearError } from '../../../lib/errors.js';
import { exitError } from '../../../lib/runner.js';
import { resolveProject } from '../../issues/shared/resolve.js';

export interface DeleteProjectOptions {
  apiKey?: string;
  token?: string;
  id: string;
  yes: boolean;
}

export async function deleteProject(opts: DeleteProjectOptions): Promise<void> {
  const { proceed, error } = await confirmDestructive(`Delete project ${opts.id}?`, opts.yes);
  if (error) {
    exitError(error);
    return;
  }
  if (!proceed) {
    console.log('Aborted.');
    return;
  }

  const clientResult = await getClientWithAuthRetry({ apiKey: opts.apiKey, token: opts.token });
  if (clientResult.isErr()) {
    exitError(clientResult.error);
    return;
  }
  const client = clientResult.value;

  const resolvedResult = await resolveProject(opts.id, client);
  if (resolvedResult.isErr()) {
    exitError(resolvedResult.error);
    return;
  }
  const projectId = resolvedResult.value;

  const result = await ResultAsync.fromPromise(client.deleteProject(projectId), (e) =>
    mapLinearError(e)
  );

  result.match(
    () => {
      console.log(`Project ${opts.id} deleted.`);
    },
    (e) => exitError(e)
  );
}
