import { LinearClient } from '@linear/sdk';
import { ResultAsync, errAsync } from 'neverthrow';
import { type ResolveOptions, resolveCredential } from '../../features/auth/resolve.js';
import { type CliError, mapLinearError } from '../errors.js';

export function getClient(opts: ResolveOptions = {}): ResultAsync<LinearClient, CliError> {
  return resolveCredential(opts).andThen((cred) => {
    // Fix #5: wrap synchronous constructor so any thrown error becomes err()
    let client: LinearClient;
    try {
      client =
        cred.type === 'apiKey'
          ? new LinearClient({ apiKey: cred.value })
          : new LinearClient({ accessToken: cred.value });
    } catch (e) {
      return errAsync(mapLinearError(e));
    }
    return ResultAsync.fromPromise(Promise.resolve(client), (e) => mapLinearError(e));
  });
}
