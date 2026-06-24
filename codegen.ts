/**
 * GraphQL Code Generator configuration.
 *
 * One-time schema refresh:
 *   Download the Linear GraphQL SDL from the public Apollo Studio Linear-API graph:
 *   https://studio.apollographql.com/public/Linear-API/variant/current/schema/reference
 *   Save as schema.graphql in the project root.
 *
 *   Alternatively, if Apollo Studio is unavailable, introspect the Linear API directly:
 *   npx graphql-codegen introspect-schema https://api.linear.app/graphql \
 *     --header "Authorization: ${LINEAR_API_KEY}" \
 *     --output schema.graphql
 *
 *   After refreshing schema.graphql, re-run: pnpm run codegen
 *
 * codegen is NOT wired into the tsdown build — it is a manual dev step.
 * src/gql/ output is committed so no schema access is required at build time.
 */

import type { CodegenConfig } from '@graphql-codegen/cli';

const config: CodegenConfig = {
  schema: './schema.graphql',
  documents: ['src/**/*.ts', '!src/gql/**'],
  ignoreNoDocuments: true,
  generates: {
    'src/gql/': {
      preset: 'client',
      presetConfig: {
        // Fragment masking disabled — we use named fragments directly without
        // the useFragment() wrapper, keeping the codebase simple.
        fragmentMasking: false,
      },
      config: {
        // Map Linear custom scalars to TypeScript primitives
        scalars: {
          DateTime: 'string',
          TimelessDate: 'string',
          JSONObject: 'Record<string, unknown>',
          UUID: 'string',
          Upload: 'unknown',
        },
      },
    },
  },
};

export default config;
