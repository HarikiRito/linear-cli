import { graphql } from '../../../gql/gql.js';

/**
 * Uses Linear's native searchIssues query so results keep Linear's own ranking
 * (identifier match, typo tolerance, comment search); no client-side filtering.
 */
export const SEARCH_ISSUES_QUERY = graphql(`
  query SearchIssues(
    $term: String!
    $first: Int
    $after: String
    $filter: IssueFilter
    $includeComments: Boolean
    $includeArchived: Boolean
  ) {
    searchIssues(
      term: $term
      first: $first
      after: $after
      filter: $filter
      includeComments: $includeComments
      includeArchived: $includeArchived
    ) {
      nodes {
        identifier
        title
        state { name }
        assignee { displayName }
        labels {
          nodes {
            name
          }
        }
        relations {
          nodes {
            type
            relatedIssue {
              identifier
            }
          }
        }
        inverseRelations {
          nodes {
            type
            issue {
              identifier
            }
          }
        }
      }
      pageInfo {
        hasNextPage
        endCursor
      }
    }
  }
`);
