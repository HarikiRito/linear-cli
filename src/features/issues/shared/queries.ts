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

export const ISSUE_PROJECT_SCOPE_QUERY = graphql(`
  query IssueProjectScope($id: String!) {
    issue(id: $id) {
      project {
        id
      }
    }
  }
`);
