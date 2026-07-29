import { graphql } from '../../../gql/gql.js';

/**
 * Uses Linear's native searchIssues query (preferred over issues(filter: { or: [...] }))
 * because it uses Linear's full-text + vector search index and ranks by relevance.
 * searchIssues accepts a filter: IssueFilter argument (confirmed from SDK types),
 * so we pass backlog exclusion server-side via $filter.
 * searchIssues returns IssueSearchPayload with nodes: [IssueSearchResult], which has the
 * same displayable fields as Issue but is a distinct type — inline fields are used here.
 *
 * see relevance.ts for why client-side filtering is needed here —
 * `description` is fetched so query.ts can apply that filter.
 */
export const SEARCH_ISSUES_QUERY = graphql(`
  query SearchIssues($term: String!, $first: Int, $after: String, $filter: IssueFilter) {
    searchIssues(term: $term, first: $first, after: $after, filter: $filter) {
      nodes {
        identifier
        title
        description
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
