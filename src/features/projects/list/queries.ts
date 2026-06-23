import { PROJECT_FIELDS } from '../shared/fields.js';

export const LIST_PROJECTS_QUERY = `
  query ListProjects($first: Int, $after: String) {
    projects(first: $first, after: $after) {
      ${PROJECT_FIELDS}
    }
  }
`;
