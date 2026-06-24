import { graphql } from '../../gql/gql.js';

export const LIST_LABELS_QUERY = graphql(`
  query ListLabels($first: Int, $after: String, $filter: IssueLabelFilter) {
    issueLabels(first: $first, after: $after, filter: $filter) {
      nodes {
        id
        name
        color
        parent {
          id
        }
      }
      pageInfo {
        hasNextPage
        endCursor
      }
    }
  }
`);
