import { graphql } from '../../../gql/gql.js';

export const LIST_PROJECT_UPDATES_QUERY = graphql(`
  query ListProjectUpdates($projectId: String!, $first: Int, $after: String) {
    project(id: $projectId) {
      # Linear returns newest first for createdAt (verified live)
      projectUpdates(first: $first, after: $after, orderBy: createdAt) {
        nodes {
          id
          createdAt
          health
          body
          user {
            name
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

export const GET_PROJECT_UPDATE_QUERY = graphql(`
  query GetProjectUpdate($id: String!) {
    projectUpdate(id: $id) {
      id
      createdAt
      health
      body
      url
      user {
        name
      }
    }
  }
`);
