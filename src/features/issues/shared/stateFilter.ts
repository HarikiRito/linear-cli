/**
 * Builds an IssueFilter from a list of snake_case state tokens.
 *
 * Conversion: replace underscores with spaces, then match via state.name.eqIgnoreCase.
 * Multiple tokens are combined with OR.
 *
 * Example: ['todo', 'in_progress'] =>
 *   { or: [{ state: { name: { eqIgnoreCase: 'todo' } } }, { state: { name: { eqIgnoreCase: 'in progress' } } }] }
 */

import { err, ok, type Result } from 'neverthrow';
import { ValidationError } from '../../../lib/errors.js';

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

// Recognized --state tokens (snake_case, matching Linear's standard default workflow states).
export const KNOWN_STATE_TOKENS = [
  'triage',
  'backlog',
  'todo',
  'in_progress',
  'in_review',
  'done',
  'canceled',
  'duplicate',
] as const;

/** Returns the subset of tokens not in KNOWN_STATE_TOKENS, preserving input order. */
export function findUnknownStateTokens(tokens: string[]): string[] {
  const known = new Set<string>(KNOWN_STATE_TOKENS);
  return tokens.filter((token) => !known.has(token));
}

/**
 * Validates --state tokens against KNOWN_STATE_TOKENS. Callers should run this
 * before any client/API work so invalid input fails fast (see H-634).
 */
export function validateStateTokens(tokens: string[]): Result<void, ValidationError> {
  const unknownTokens = findUnknownStateTokens(tokens);
  if (unknownTokens.length > 0) {
    return err(
      new ValidationError(
        `Unknown --state token(s): ${unknownTokens.join(', ')}. Valid tokens: ${KNOWN_STATE_TOKENS.join(', ')}`
      )
    );
  }
  return ok(undefined);
}
