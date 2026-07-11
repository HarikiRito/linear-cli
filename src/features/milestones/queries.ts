import { graphql } from '../../gql/gql.js';

/**
 * Top-level (non project-scoped) milestone listing, filtered via
 * ProjectMilestoneFilter. Used by `milestones list` so a project_ids config
 * fallback with multiple entries can express an OR/"in" filter across all of
 * them — something the single-project(id) query above cannot do.
 */
export const LIST_PROJECT_MILESTONES_BY_FILTER_QUERY = graphql(`
  query ListProjectMilestonesByFilter(
    $filter: ProjectMilestoneFilter
    $first: Int
    $after: String
  ) {
    projectMilestones(filter: $filter, first: $first, after: $after) {
      nodes {
        id
        name
        targetDate
        description
      }
      pageInfo {
        hasNextPage
        endCursor
      }
    }
  }
`);

export const GET_PROJECT_MILESTONE_QUERY = graphql(`
  query GetProjectMilestone($id: String!) {
    projectMilestone(id: $id) {
      id
      name
      targetDate
      description
      progress
      sortOrder
      project {
        id
        name
      }
    }
  }
`);
