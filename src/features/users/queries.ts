import { graphql } from '../../gql/gql.js';

export const LIST_USERS_QUERY = graphql(`
  query ListUsers($first: Int, $after: String) {
    users(first: $first, after: $after) {
      nodes {
        id
        name
        displayName
        email
        active
      }
      pageInfo {
        hasNextPage
        endCursor
      }
    }
  }
`);

export const GET_USER_QUERY = graphql(`
  query GetUser($id: String!) {
    user(id: $id) {
      id
      name
      displayName
      email
      active
      url
      avatarUrl
    }
  }
`);
