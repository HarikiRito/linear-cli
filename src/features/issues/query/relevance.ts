import type { IssueRow } from '../shared/render.js';

/**
 * Linear's searchIssues resolver ranks by relevance but does not strictly
 * filter out non-matching issues (per its schema doc: "Results are ranked by
 * relevance unless an orderBy parameter is specified") — a vague or unrelated
 * term can still return the full project's issue cluster, just reordered.
 *
 * To satisfy "results only include issues where the term (or a close
 * semantic match) appears in the title/description" (H-321), we apply a
 * client-side term-match filter on top of the server's ranked results:
 * every significant word of the search term must appear (case-insensitively,
 * substring match) somewhere in the issue's title or description.
 */

const STOPWORDS = new Set([
  'a',
  'an',
  'the',
  'of',
  'in',
  'on',
  'at',
  'to',
  'for',
  'and',
  'or',
  'is',
  'are',
  'was',
  'were',
  'be',
  'by',
  'with',
]);

/** Split a search term into lowercase, deduplicated, non-stopword tokens. */
export function significantTokens(term: string): string[] {
  const tokens = term
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((t) => t.length > 0 && !STOPWORDS.has(t));
  return Array.from(new Set(tokens));
}

/** True if every significant token of `term` appears in title or description. */
export function matchesTerm(
  row: Pick<IssueRow, 'title' | 'description'>,
  tokens: string[]
): boolean {
  if (tokens.length === 0) return true;
  const haystack = `${row.title} ${row.description ?? ''}`.toLowerCase();
  return tokens.every((token) => haystack.includes(token));
}

/**
 * Filter search results down to issues that actually relate to `term`,
 * compensating for the server's relevance-only (non-filtering) ranking.
 * Falls back to the unfiltered rows if the term yields no significant
 * tokens (e.g. term is entirely stopwords/punctuation).
 */
export function filterByTermRelevance(rows: IssueRow[], term: string): IssueRow[] {
  const tokens = significantTokens(term);
  if (tokens.length === 0) return rows;
  return rows.filter((row) => matchesTerm(row, tokens));
}
