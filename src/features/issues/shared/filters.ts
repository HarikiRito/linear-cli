/**
 * Shared filter helpers for issues subcommands.
 */

export interface IssueFilterInput {
  state?: unknown;
  assignee?: unknown;
  team?: unknown;
  and?: IssueFilterInput[];
  or?: unknown[];
  [key: string]: unknown;
}

/**
 * Merge a base filter with a state filter using AND semantics.
 * If no state filter, returns base (or undefined if base is also absent).
 */
export function buildFilter(
  base: IssueFilterInput | undefined,
  stateFilter: IssueFilterInput | undefined
): IssueFilterInput | undefined {
  if (!stateFilter) return base;
  if (!base) return stateFilter;
  return { and: [base, stateFilter] };
}
