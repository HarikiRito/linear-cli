import { graphql } from '../../../gql/gql.js';

export const ISSUE_HISTORY_QUERY = graphql(`
  query IssueHistory($id: String!) {
    issue(id: $id) {
      id
      identifier
      history {
        nodes {
          id
          createdAt
          actors {
            id
            name
            displayName
          }
          updatedDescription
          fromTitle
          toTitle
          fromState {
            id
            name
          }
          toState {
            id
            name
          }
          fromDueDate
          toDueDate
          toConvertedProject {
            id
            name
          }
          trashed
          archived
          autoArchived
          autoClosed
        }
      }
    }
  }
`);
