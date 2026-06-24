import { graphql } from '../../../gql/gql.js';

export const GET_PROJECT_QUERY = graphql(`
  query GetProject($id: String!) {
    project(id: $id) {
      id
      name
      description
      state
      url
      startDate
      targetDate
      lead {
        id
        name
        displayName
      }
      teams {
        nodes {
          id
          name
          key
        }
      }
      members {
        nodes {
          id
          name
          displayName
        }
      }
    }
  }
`);
