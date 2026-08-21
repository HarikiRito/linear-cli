import { graphql } from '../../../gql/gql.js';

// 250 comments is well beyond what any real issue thread accumulates — a
// single page keeps this a one-request lookup rather than needing full
// cursor pagination for what's fundamentally a best-effort URL scrape.
export const GET_ISSUE_ASSETS_QUERY = graphql(`
  query GetIssueAssets($id: String!) {
    issue(id: $id) {
      id
      description
      comments(first: 250) {
        nodes {
          body
        }
      }
    }
  }
`);
