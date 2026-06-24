import { graphql } from '../../gql/gql.js';

export const LIST_DOCUMENTS_QUERY = graphql(`
  query ListDocuments($first: Int, $after: String, $filter: DocumentFilter) {
    documents(first: $first, after: $after, filter: $filter) {
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

export const GET_DOCUMENT_QUERY = graphql(`
  query GetDocument($id: String!) {
    document(id: $id) {
      id
      title
      slugId
      content
      updatedAt
      project {
        id
        name
      }
      creator {
        id
        name
        displayName
      }
    }
  }
`);
