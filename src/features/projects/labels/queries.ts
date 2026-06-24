import { graphql } from '../../../gql/gql.js';

export const PROJECT_LABELS_QUERY = graphql(`
  query ProjectLabels($id: String!, $first: Int, $after: String) {
    project(id: $id) {
      labels(first: $first, after: $after) {
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
  }
`);
