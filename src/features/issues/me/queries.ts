import { ISSUE_FIELDS } from '../shared/fields.js';

/**
 * ME_ISSUES_QUERY accepts a $filter variable so the caller can pass
 * { assignee: { isMe: { eq: true } } } merged with any additional filters
 * (e.g. backlog exclusion) using AND semantics at build time.
 */
export const ME_ISSUES_QUERY = `
  query MeIssues($first: Int, $after: String, $filter: IssueFilter) {
    issues(first: $first, after: $after, filter: $filter) {
      ${ISSUE_FIELDS}
    }
  }
`;
