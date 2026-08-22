import { graphql } from '../../../gql/gql.js';

export const LIST_ATTACHMENTS_QUERY = graphql(`
  query ListAttachments($id: String!) {
    issue(id: $id) {
      id
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

// Targeted single-attachment lookup for `attachments download`, instead of
// fetching the issue's full attachment list and filtering client-side.
// Attachment IDs are global (not scoped to an issue), so callers MUST verify
// `attachment.issue.id` matches the resolved issue before trusting the result.
export const GET_ATTACHMENT_QUERY = graphql(`
  query GetAttachment($id: String!) {
    attachment(id: $id) {
      id
      title
      url
      issue {
        id
        identifier
      }
    }
  }
`);
