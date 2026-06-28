import { ResultAsync } from 'neverthrow';
import { getClientWithAuthRetry } from '../../../lib/client/index.js';
import { coerceCliError } from '../../../lib/errors.js';
import { exitError } from '../../../lib/runner.js';
import { resolveIssueIdentifier } from '../shared/resolve.js';

export interface SubscribeOptions {
  apiKey?: string;
  token?: string;
  issue: string;
}

async function toggleSubscribe(
  opts: SubscribeOptions,
  action: 'subscribe' | 'unsubscribe'
): Promise<void> {
  const clientResult = await getClientWithAuthRetry({ apiKey: opts.apiKey, token: opts.token });
  if (clientResult.isErr()) {
    exitError(clientResult.error);
    return;
  }
  const client = clientResult.value;

  const idResult = await resolveIssueIdentifier(opts.issue, client);
  if (idResult.isErr()) {
    exitError(idResult.error);
    return;
  }
  const resolvedId = idResult.value;

  const result = await ResultAsync.fromPromise(
    action === 'subscribe' ? client.issueSubscribe(resolvedId) : client.issueUnsubscribe(resolvedId),
    coerceCliError
  );

  result.match(
    () =>
      console.log(
        action === 'subscribe' ? `Subscribed to ${opts.issue}.` : `Unsubscribed from ${opts.issue}.`
      ),
    (e) => exitError(e)
  );
}

export async function subscribeToIssue(opts: SubscribeOptions): Promise<void> {
  return toggleSubscribe(opts, 'subscribe');
}

export async function unsubscribeFromIssue(opts: SubscribeOptions): Promise<void> {
  return toggleSubscribe(opts, 'unsubscribe');
}
