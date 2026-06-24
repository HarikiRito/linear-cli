import { graphql } from '../../../gql/gql.js';

export const GET_ISSUE_QUERY = graphql(`
  query GetIssue($id: String!) {
    issue(id: $id) {
      id
      identifier
      title
      description
      url
      branchName
      priority
      estimate
      dueDate
      createdAt
      state {
        id
        name
        type
      }
      assignee {
        id
        name
        displayName
        email
      }
      labels {
        nodes {
          id
          name
          color
        }
      }
      project {
        id
        name
      }
      parent {
        id
        identifier
        title
      }
      children {
        nodes {
          id
          identifier
          title
        }
      }
      attachments {
        nodes {
          id
          title
          url
        }
      }
    }
  }
`);
