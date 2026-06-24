import { graphql } from '../../gql/gql.js';

export const LIST_PROJECT_MILESTONES_QUERY = graphql(`
  query ListProjectMilestones($id: String!, $first: Int, $after: String) {
    project(id: $id) {
      projectMilestones(first: $first, after: $after) {
        nodes {
          id
          name
          targetDate
          description
        }
        pageInfo {
          hasNextPage
          endCursor
        }
      }
    }
  }
`);

export const GET_PROJECT_MILESTONE_QUERY = graphql(`
  query GetProjectMilestone($id: String!) {
    projectMilestone(id: $id) {
      id
      name
      targetDate
      description
      progress
      sortOrder
      project {
        id
        name
      }
    }
  }
`);
