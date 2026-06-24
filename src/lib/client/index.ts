import { LinearClient } from '@linear/sdk';
import type { TypedDocumentNode } from '@graphql-typed-document-node/core';
import { ResultAsync, errAsync, okAsync } from 'neverthrow';
import { type ResolveOptions, resolveCredential } from '../../features/auth/resolve.js';
import { type CliError, mapLinearError } from '../errors.js';
import type { RequestFn } from '../pagination.js';

export function getClient(opts: ResolveOptions = {}): ResultAsync<LinearClient, CliError> {
  return resolveCredential(opts).andThen((cred) => {
    let client: LinearClient;
    try {
      client =
        cred.type === 'apiKey'
          ? new LinearClient({ apiKey: cred.value })
          : new LinearClient({ accessToken: cred.value });
    } catch (e) {
      return errAsync(mapLinearError(e));
    }
    return okAsync(client);
  });
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
