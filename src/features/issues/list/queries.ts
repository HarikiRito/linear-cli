import { ISSUE_FIELDS } from '../shared/fields.js';

export const LIST_ISSUES_QUERY = `
  query ListIssues($first: Int, $after: String, $filter: IssueFilter) {
    issues(first: $first, after: $after, filter: $filter) {
      ${ISSUE_FIELDS}
    }
  }
`;
