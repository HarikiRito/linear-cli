import { graphql } from '../../../gql/gql.js';

export const LIST_ISSUES_QUERY = graphql(`
  query ListIssues($first: Int, $after: String, $filter: IssueFilter) {
    issues(first: $first, after: $after, filter: $filter) {
      nodes {
        ...IssueFields
      }
      pageInfo {
        hasNextPage
        endCursor
      }
    }
  }
`);
