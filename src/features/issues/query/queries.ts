import { ISSUE_FIELDS } from '../shared/fields.js';

/**
 * Uses Linear's native searchIssues query (preferred over issues(filter: { or: [...] }))
 * because it uses Linear's full-text search index and ranks by relevance.
 * searchIssues accepts a filter: IssueFilter argument (confirmed from SDK types),
 * so we pass backlog exclusion server-side via $filter.
 * searchIssues returns IssueSearchPayload which has the same nodes/pageInfo shape
 * as IssueConnection, so the shared ISSUE_FIELDS fragment applies directly.
 */
export const SEARCH_ISSUES_QUERY = `
  query SearchIssues($term: String!, $first: Int, $after: String, $filter: IssueFilter) {
    searchIssues(term: $term, first: $first, after: $after, filter: $filter) {
      ${ISSUE_FIELDS}
    }
  }
`;
