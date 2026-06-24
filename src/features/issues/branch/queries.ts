import { graphql } from '../../../gql/gql.js';

export const GET_ISSUE_BRANCH_QUERY = graphql(`
  query GetIssueBranch($id: String!) {
    issue(id: $id) {
      id
      branchName
    }
  }
`);
