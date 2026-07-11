/**
 * Shared filter helpers for issues subcommands.
 */

export interface IssueFilterInput {
  state?: unknown;
  assignee?: unknown;
  team?: unknown;
  project?: unknown;
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

/** Shared shape for narrowing any project-scoped entity (Issue, Document, ProjectMilestone) to one or more project ids. */
export interface ProjectIdFilter {
  project: { id: { in: string[] } };
  // Structurally compatible with IssueFilterInput (which has this index
  // signature) so callers can assign a ProjectIdFilter directly into an
  // IssueFilterInput-typed variable/parameter without a cast.
  [key: string]: unknown;
}

/**
 * Resolve the project filter fragment for commands that accept a single
 * --project flag but fall back to an OR/"in" filter across ALL configured
 * default project ids when it's omitted: `{ id: { in: [explicit] } }`-style
 * narrowing when an explicit project was resolved, or `{ id: { in: ids } }`
 * across the full configured list when falling back to config, or undefined
 * when neither is available.
 *
 * Takes `getDefaultIds` as a lazy accessor rather than calling
 * getDefaultProjectIds() directly — see resolveDefaultProjectId() in
 * resolve.ts for why: it must be skipped entirely when an explicit project
 * was given, and passing the caller's own function reference keeps this
 * helper correctly mockable regardless of which module owns it.
 */
export function buildDefaultProjectFilter(
  explicitProjectId: string | undefined,
  getDefaultIds: () => string[] | undefined
): ProjectIdFilter | undefined {
  if (explicitProjectId !== undefined) {
    return { project: { id: { in: [explicitProjectId] } } };
  }
  const defaultProjectIds = getDefaultIds();
  return defaultProjectIds && defaultProjectIds.length > 0
    ? { project: { id: { in: defaultProjectIds } } }
    : undefined;
}
