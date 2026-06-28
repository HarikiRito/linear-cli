import { graphql } from '../../../gql/gql.js';

export const ISSUE_RELATIONS_QUERY = graphql(`
  query IssueRelations($id: String!) {
    issue(id: $id) {
      id
      identifier
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
      relations {
        nodes {
          id
          type
          relatedIssue {
            id
            identifier
            title
          }
        }
      }
      inverseRelations {
        nodes {
          id
          type
          issue {
            id
            identifier
            title
          }
        }
      }
    }
  }
`);
