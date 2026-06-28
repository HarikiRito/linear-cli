import { ResultAsync } from 'neverthrow';
import { getClientWithAuthRetry, getRequestFn } from '../../../lib/client/index.js';
import { coerceCliError, mapLinearError, NotFoundError } from '../../../lib/errors.js';
import { exitError } from '../../../lib/runner.js';
import { resolveIssueIdentifier } from '../shared/resolve.js';
import { VIEWER_FAVORITES_QUERY } from './queries.js';

export interface FavoriteOptions {
  apiKey?: string;
  token?: string;
  issue: string;
}

export async function favoriteIssue(opts: FavoriteOptions): Promise<void> {
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
    client.createFavorite({ issueId: resolvedId }),
    (e) => mapLinearError(e)
  );

  result.match(
    () => {
      console.log(`Issue ${opts.issue} added to favorites.`);
    },
    (e) => exitError(e)
  );
}

export async function unfavoriteIssue(opts: FavoriteOptions): Promise<void> {
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

  const requestFn = getRequestFn(client);

  const result = await ResultAsync.fromPromise(
    requestFn(VIEWER_FAVORITES_QUERY, {}).then(async (data) => {
      // resolvedId may be an ENG-N identifier or a UUID. Match on either so
      // that both input forms work correctly.
      const match = data.favorites.nodes.find(
        (f) =>
          f.type === 'issue' &&
          (f.issue?.id === resolvedId || f.issue?.identifier === resolvedId)
      );
      if (!match) {
        throw new NotFoundError('favorite', opts.issue);
      }
      await client.deleteFavorite(match.id);
      return match.id;
    }),
    coerceCliError
  );

  result.match(
    () => {
      console.log(`Issue ${opts.issue} removed from favorites.`);
    },
    (e) => exitError(e)
  );
}
