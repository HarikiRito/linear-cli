import type { TypedDocumentNode } from '@graphql-typed-document-node/core';
import { LinearClient } from '@linear/sdk';
import { Result, type ResultAsync } from 'neverthrow';
import { type ResolveOptions, resolveCredential } from '../../features/auth/resolve.js';
import { type CliError, mapLinearError } from '../errors.js';
import type { RequestFn } from '../pagination.js';

export function getClient(opts: ResolveOptions = {}): ResultAsync<LinearClient, CliError> {
  return resolveCredential(opts).andThen((cred) =>
    Result.fromThrowable(
      () =>
        cred.type === 'apiKey'
          ? new LinearClient({ apiKey: cred.value })
          : new LinearClient({ accessToken: cred.value }),
      mapLinearError
    )()
  );
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
