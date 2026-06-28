import { graphql } from '../../../gql/gql.js';

export const ISSUE_COPY_QUERY = graphql(`
  query IssueCopy($id: String!) {
    issue(id: $id) {
      id
      identifier
      url
      branchName
    }
  }
`);
