import { graphql } from '../../../gql/gql.js';

/**
 * Named GraphQL fragment for issue nodes, used across all issues subcommands.
 * Typed via @graphql-codegen/client-preset — run `pnpm run codegen` to regenerate.
 */
export const IssueFieldsFragment = graphql(`
  fragment IssueFields on Issue {
    identifier
    title
    state { name }
    assignee { displayName }
  }
`);
