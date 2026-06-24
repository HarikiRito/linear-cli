import { ResultAsync } from 'neverthrow';
import { getClient, getRequestFn } from '../../../lib/client/index.js';
import { mapLinearError } from '../../../lib/errors.js';
import { confirmDestructive } from '../../../lib/confirm.js';
import { exitError } from '../../../lib/runner.js';
import { COMMENT_DELETE_MUTATION } from './mutations.js';

export interface DeleteCommentOptions {
  apiKey?: string;
  token?: string;
  id: string;
  yes: boolean;
}

export async function deleteComment(opts: DeleteCommentOptions): Promise<void> {
  const { proceed, error } = await confirmDestructive(
    `Delete comment ${opts.id}?`,
    opts.yes
  );
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
  const requestFn = getRequestFn(client);

  const result = await ResultAsync.fromPromise(
    requestFn(COMMENT_DELETE_MUTATION, { id: opts.id }),
    (e) => mapLinearError(e)
  );

  result.match(
    () => {
      console.log(`Comment ${opts.id} deleted.`);
    },
    (e) => exitError(e)
  );
}
