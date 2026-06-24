export const LIST_COMMENTS_QUERY = `
  query ListComments($issueId: String!, $first: Int, $after: String) {
    issue(id: $issueId) {
      comments(first: $first, after: $after) {
        nodes {
          id
          body
          createdAt
          parentId
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
`;
