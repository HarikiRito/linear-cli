import { graphql } from '../../../gql/gql.js';

export const LIST_COMMENTS_QUERY = graphql(`
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
`);

export const COMMENT_ISSUE_ID_QUERY = graphql(`
  query CommentIssueId($id: String!) {
    comment(id: $id) {
      issueId
    }
  }
`);
