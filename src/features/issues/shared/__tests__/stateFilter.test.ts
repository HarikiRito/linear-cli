import { describe, expect, it } from 'vitest';
import { buildStateFilter, findUnknownStateTokens, KNOWN_STATE_TOKENS } from '../stateFilter.js';

describe('buildStateFilter', () => {
  it('converts underscores to spaces for eqIgnoreCase matching', () => {
    expect(buildStateFilter(['in_review'])).toEqual({
      state: { name: { eqIgnoreCase: 'in review' } },
    });
  });

  it('combines multiple tokens with OR', () => {
    expect(buildStateFilter(['todo', 'in_progress'])).toEqual({
      or: [
        { state: { name: { eqIgnoreCase: 'todo' } } },
        { state: { name: { eqIgnoreCase: 'in progress' } } },
      ],
    });
  });

  it('returns undefined for an empty token list', () => {
    expect(buildStateFilter([])).toBeUndefined();
  });
});

describe('findUnknownStateTokens', () => {
  it('returns an empty array when every token is known', () => {
    expect(findUnknownStateTokens(['todo', 'in_progress', 'in_review'])).toEqual([]);
  });

  it('flags dev_review as unknown (H-633: not a real status)', () => {
    expect(findUnknownStateTokens(['dev_review'])).toEqual(['dev_review']);
  });

  it('flags unrecognized tokens while preserving input order', () => {
    expect(findUnknownStateTokens(['todo', 'bogus_state', 'in_review'])).toEqual(['bogus_state']);
  });

  it('every KNOWN_STATE_TOKENS entry passes validation', () => {
    expect(findUnknownStateTokens([...KNOWN_STATE_TOKENS])).toEqual([]);
  });
});
