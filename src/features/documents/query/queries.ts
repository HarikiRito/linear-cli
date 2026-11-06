import { graphql } from '../../../gql/gql.js';

/** Native searchDocuments keeps Linear's ranking; no client-side filtering. */
export const SEARCH_DOCUMENTS_QUERY = graphql(`
  query SearchDocuments(
    $term: String!
    $first: Int
    $after: String
    $teamId: String
    $includeComments: Boolean
    $includeArchived: Boolean
  ) {
    searchDocuments(
      term: $term
      first: $first
      after: $after
      teamId: $teamId
      includeComments: $includeComments
      includeArchived: $includeArchived
    ) {
      nodes {
        id
        title
        slugId
        updatedAt
        project {
          id
          name
        }
      }
      pageInfo {
        hasNextPage
        endCursor
      }
    }
  }
`);
