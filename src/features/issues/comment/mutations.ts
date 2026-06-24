export const COMMENT_CREATE_MUTATION = `
  mutation CommentCreate($input: CommentCreateInput!) {
    commentCreate(input: $input) {
      success
      comment {
        id
        body
        url
        createdAt
        user {
          name
        }
      }
    }
  }
`;

export const COMMENT_UPDATE_MUTATION = `
  mutation CommentUpdate($id: String!, $input: CommentUpdateInput!) {
    commentUpdate(id: $id, input: $input) {
      success
      comment {
        id
        body
        url
        createdAt
        user {
          name
        }
      }
    }
  }
`;

export const COMMENT_DELETE_MUTATION = `
  mutation CommentDelete($id: String!) {
    commentDelete(id: $id) {
      success
    }
  }
`;
