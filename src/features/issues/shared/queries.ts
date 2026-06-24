import { graphql } from '../../../gql/gql.js';

export const PROJECT_MILESTONES_QUERY = graphql(`
  query ProjectMilestones($id: String!) {
    project(id: $id) {
      projectMilestones {
        nodes {
          id
          name
        }
      }
    }
  }
`);
