import { graphql } from '../../gql/gql.js';

export const LIST_CYCLES_QUERY = graphql(`
  query ListCycles($first: Int, $after: String, $filter: CycleFilter) {
    cycles(first: $first, after: $after, filter: $filter) {
      nodes {
        id
        name
        number
        startsAt
        endsAt
        completedAt
      }
      pageInfo {
        hasNextPage
        endCursor
      }
    }
  }
`);
