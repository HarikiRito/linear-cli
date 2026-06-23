/**
 * Shared GraphQL field set for issue nodes, used across all issues subcommands.
 * Import ISSUE_FIELDS into a query string with ${ISSUE_FIELDS}.
 */
export const ISSUE_FIELDS = `
  nodes {
    identifier
    title
    state { name }
    assignee { displayName }
  }
  pageInfo {
    hasNextPage
    endCursor
  }
`;
