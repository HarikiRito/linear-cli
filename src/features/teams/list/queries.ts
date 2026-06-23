import { TEAM_FIELDS } from '../shared/fields.js';

export const LIST_TEAMS_QUERY = `
  query ListTeams($first: Int, $after: String) {
    teams(first: $first, after: $after) {
      ${TEAM_FIELDS}
    }
  }
`;
