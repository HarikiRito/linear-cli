import { describe, expect, it } from 'vitest';
import type { IssueRow } from '../../shared/render.js';
import { filterByTermRelevance, matchesTerm, significantTokens } from '../relevance.js';

function row(overrides: Partial<IssueRow> = {}): IssueRow {
  return {
    identifier: 'ENG-1',
    title: '',
    description: null,
    state: 'Todo',
    assignee: '',
    priority: 0,
    trashed: false,
    archivedAt: null,
    labels: [],
    blockedBy: [],
    blocking: [],
    ...overrides,
  };
}

describe('significantTokens', () => {
  it('lowercases and splits on non-alphanumeric characters', () => {
    expect(significantTokens('Batch Review')).toEqual(['batch', 'review']);
  });

  it('drops stopwords', () => {
    expect(significantTokens('a review of the batch')).toEqual(['review', 'batch']);
  });

  it('empty/stopword-only term yields no tokens', () => {
    expect(significantTokens('the of')).toEqual([]);
  });

  it('keeps significant single-character tokens', () => {
    expect(significantTokens('C bug')).toEqual(['c', 'bug']);
  });

  it('tokenizes non-Latin scripts (unicode-aware)', () => {
    expect(significantTokens('日本語 テスト')).toEqual(['日本語', 'テスト']);
    expect(significantTokens('Привет мир')).toEqual(['привет', 'мир']);
  });
});

describe('matchesTerm', () => {
  it('matches when every token appears in the title', () => {
    expect(matchesTerm(row({ title: 'Batch review pipeline' }), ['batch', 'review'])).toBe(true);
  });

  it('matches when tokens are split across title and description', () => {
    expect(
      matchesTerm(row({ title: 'Review pipeline', description: 'Handles batch submissions' }), [
        'batch',
        'review',
      ])
    ).toBe(true);
  });

  it('does not match when a token is missing from both title and description', () => {
    expect(
      matchesTerm(row({ title: 'GitHub webhook ingestion pipeline' }), ['batch', 'review'])
    ).toBe(false);
  });

  it('is case-insensitive', () => {
    expect(matchesTerm(row({ title: 'BATCH REVIEW' }), ['batch', 'review'])).toBe(true);
  });

  it('empty token list matches everything', () => {
    expect(matchesTerm(row({ title: 'anything' }), [])).toBe(true);
  });
});

describe('filterByTermRelevance', () => {
  const rows: IssueRow[] = [
    row({ identifier: 'ENG-1', title: 'Batch review pipeline for code submissions' }),
    row({ identifier: 'ENG-2', title: 'Single review workflow' }),
    row({ identifier: 'ENG-3', title: 'Review comments UI polish' }),
    row({ identifier: 'ENG-4', title: 'GitHub review integration' }),
    row({ identifier: 'ENG-5', title: 'GitHub webhook ingestion pipeline' }),
  ];

  it('"batch review" only returns the issue mentioning both batch and review', () => {
    const result = filterByTermRelevance(rows, 'batch review');
    expect(result.map((r) => r.identifier)).toEqual(['ENG-1']);
  });

  it('"single review" only returns the issue mentioning both single and review', () => {
    const result = filterByTermRelevance(rows, 'single review');
    expect(result.map((r) => r.identifier)).toEqual(['ENG-2']);
  });

  it('"review comments" only returns the issue mentioning both review and comments', () => {
    const result = filterByTermRelevance(rows, 'review comments');
    expect(result.map((r) => r.identifier)).toEqual(['ENG-3']);
  });

  it('"GitHub review" only returns the issue mentioning both github and review', () => {
    const result = filterByTermRelevance(rows, 'GitHub review');
    expect(result.map((r) => r.identifier)).toEqual(['ENG-4']);
  });

  it('different unrelated terms against the same set produce different result sets', () => {
    const batch = filterByTermRelevance(rows, 'batch review').map((r) => r.identifier);
    const single = filterByTermRelevance(rows, 'single review').map((r) => r.identifier);
    const comments = filterByTermRelevance(rows, 'review comments').map((r) => r.identifier);
    const github = filterByTermRelevance(rows, 'GitHub review').map((r) => r.identifier);

    expect(new Set([...batch, ...single, ...comments, ...github]).size).toBeGreaterThan(1);
    expect(batch).not.toEqual(single);
    expect(batch).not.toEqual(comments);
    expect(batch).not.toEqual(github);
  });

  it('unrelated title never matches an unrelated term', () => {
    const result = filterByTermRelevance(rows, 'batch review');
    expect(result.map((r) => r.identifier)).not.toContain('ENG-5');
  });

  it('a single-character significant token filters out non-matching issues', () => {
    const rowsWithSingleChar: IssueRow[] = [
      row({ identifier: 'ENG-6', title: 'C bug in parser' }),
      row({ identifier: 'ENG-7', title: 'Unrelated bug in JS parser' }),
    ];
    const result = filterByTermRelevance(rowsWithSingleChar, 'C bug');
    expect(result.map((r) => r.identifier)).toEqual(['ENG-6']);
  });

  it('a non-Latin search term filters results instead of falling back to unfiltered rows', () => {
    const rowsNonLatin: IssueRow[] = [
      row({ identifier: 'ENG-8', title: '日本語のバグ修正' }),
      row({ identifier: 'ENG-9', title: 'Unrelated English issue' }),
    ];
    const result = filterByTermRelevance(rowsNonLatin, '日本語');
    expect(result.map((r) => r.identifier)).toEqual(['ENG-8']);
  });
});
