import { graphql } from '../../../gql/gql.js';

/** Native searchProjects keeps Linear's ranking; no client-side filtering. */
export const SEARCH_PROJECTS_QUERY = graphql(`
  query SearchProjects(
    $term: String!
    $first: Int
    $after: String
    $teamId: String
    $includeComments: Boolean
    $includeArchived: Boolean
  ) {
    searchProjects(
      term: $term
      first: $first
      after: $after
      teamId: $teamId
      includeComments: $includeComments
      includeArchived: $includeArchived
    ) {
      nodes {
        id
        name
        state
      }
      pageInfo {
        hasNextPage
        endCursor
      }
    }
  }
`);
