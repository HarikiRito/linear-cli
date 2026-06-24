export const ISSUE_DELETE_MUTATION = `
  mutation IssueDelete($id: String!) {
    issueDelete(id: $id) {
      success
    }
  }
`;
