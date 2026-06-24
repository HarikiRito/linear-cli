import { graphql } from '../../gql/gql.js';

export const LIST_STATUSES_QUERY = graphql(`
  query ListStatuses($first: Int, $after: String, $filter: WorkflowStateFilter) {
    workflowStates(first: $first, after: $after, filter: $filter) {
      nodes {
        id
        name
        type
        color
        position
      }
      pageInfo {
        hasNextPage
        endCursor
      }
    }
  }
`);
