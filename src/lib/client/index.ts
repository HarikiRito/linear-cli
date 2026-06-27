import type { TypedDocumentNode } from '@graphql-typed-document-node/core';
import { LinearClient } from '@linear/sdk';
import { ok, type ResultAsync } from 'neverthrow';
import {
  type ResolvedCredential,
  type ResolveOptions,
  resolveCredential,
} from '../../features/auth/resolve.js';
import { type CliError, mapLinearError } from '../errors.js';
import type { RequestFn } from '../pagination.js';

function buildLinearClient(cred: ResolvedCredential): LinearClient {
  return cred.type === 'apiKey'
    ? new LinearClient({ apiKey: cred.value })
    : new LinearClient({ accessToken: cred.value });
}

/**
 * Check the RAW thrown error for genuine 401/auth signals BEFORE mapping it.
 * mapLinearError's catch-all maps any unrecognised error to AuthError, so we
 * must inspect the original message to avoid triggering a refresh on e.g. 500s.
 */
function isRawAuthError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  const msg = err.message.toLowerCase();
  return (
    msg.includes('401') ||
    msg.includes('unauthorized') ||
    msg.includes('unauthenticated') ||
    msg.includes('authentication')
  );
}

/**
 * Shared retry-once-on-auth-failure logic. Calls `attempt()`, and on a genuine
 * 401 forces a token refresh, invokes `onFreshClient` so the caller can update
 * its mutable reference, then retries exactly once.
 */
async function withAuthRetry<T>(
  attempt: () => Promise<T>,
  opts: ResolveOptions,
  onFreshClient: (freshClient: LinearClient) => void
): Promise<T> {
  try {
    return await attempt();
  } catch (err) {
    if (!isRawAuthError(err)) throw mapLinearError(err);

    // Genuine auth failure — force refresh writing back to the originating scope
    const freshResult = await resolveCredential({ ...opts, forceRefresh: true });
    if (freshResult.isErr()) throw freshResult.error;

    onFreshClient(buildLinearClient(freshResult.value));

    // Retry exactly once — surface any error without further retry
    try {
      return await attempt();
    } catch (retryErr) {
      throw mapLinearError(retryErr);
    }
  }
}

export function getRequestFn(client: LinearClient): RequestFn {
  return <TData, TVariables extends Record<string, unknown>>(
    doc: TypedDocumentNode<TData, TVariables>,
    vars: TVariables
  ): Promise<TData> =>
    client.client.request<TData, TVariables>(
      doc as unknown as Parameters<typeof client.client.request>[0],
      vars
    );
}

/**
 * Build a LinearClient whose internal GraphQL request is patched to retry once
 * on a genuine 401/auth error. Persists rotated tokens to the originating scope
 * (project vs. global) via forceRefresh — no cross-writing.
 *
 * All LinearClient SDK method calls (mutations, queries) and any getRequestFn()
 * call on the returned client both go through this retry logic automatically.
 * API-key sessions pass through unchanged (no refresh attempted).
 */
export function getClientWithAuthRetry(
  opts: ResolveOptions = {}
): ResultAsync<LinearClient, CliError> {
  return resolveCredential(opts).andThen((cred) => {
    const linearClient = buildLinearClient(cred);
    const gqlClient = linearClient.client;

    // Keep a mutable reference so a successful refresh updates future calls too
    let currentRequest: typeof gqlClient.request = gqlClient.request.bind(gqlClient);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (gqlClient as any).request = async function <T>(...args: unknown[]): Promise<T> {
      return withAuthRetry(
        () => (currentRequest as (...a: unknown[]) => Promise<T>)(...args),
        opts,
        (freshClient) => {
          currentRequest = freshClient.client.request.bind(freshClient.client);
        }
      );
    };

    return ok(linearClient);
  });
}


