/**
 * Builds an IssueFilter from a list of snake_case state tokens.
 *
 * Conversion: replace underscores with spaces, then match via state.name.eqIgnoreCase.
 * Multiple tokens are combined with OR.
 *
 * Example: ['todo', 'in_progress'] =>
 *   { or: [{ state: { name: { eqIgnoreCase: 'todo' } } }, { state: { name: { eqIgnoreCase: 'in progress' } } }] }
 */

export interface StateFilterClause {
  state: { name: { eqIgnoreCase: string } };
}

export interface StateOrFilter {
  or: StateFilterClause[];
}

export type StateFilter = StateFilterClause | StateOrFilter;

export function buildStateFilter(tokens: string[]): StateFilter | undefined {
  if (tokens.length === 0) return undefined;
  const clauses: StateFilterClause[] = tokens.map((token) => ({
    state: { name: { eqIgnoreCase: token.replace(/_/g, ' ') } },
  }));
  if (clauses.length === 1) return clauses[0];
  return { or: clauses };
}
