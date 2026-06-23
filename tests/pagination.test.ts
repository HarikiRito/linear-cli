import { describe, expect, it, vi } from 'vitest';
import { RateLimitError } from '../src/lib/errors.js';
import { fetchPaged } from '../src/lib/pagination.js';

describe('fetchPaged --all typed error propagation', () => {
  it('propagates RateLimitError unchanged when a page fails mid-all-fetch', async () => {
    // First page succeeds; second page rejects with a RATELIMITED error message
    // (as Linear's GraphQL client throws it). The --all loop must NOT destroy the
    // typed error by wrapping it through a fromPromise catch.
    let callCount = 0;
    const requestFn = vi.fn(() => {
      callCount++;
      if (callCount === 1) {
        return Promise.resolve({
          items: {
            nodes: [{ id: 'r1' }],
            pageInfo: { hasNextPage: true, endCursor: 'cur1' },
          },
        });
      }
      // Linear returns RATELIMITED in the error message
      return Promise.reject(new Error('RATELIMITED: too many requests'));
    });

    const result = await fetchPaged(
      requestFn,
      'query { items { nodes { id } pageInfo { hasNextPage endCursor } } }',
      {},
      'items',
      (nodes: { id: string }[]) => nodes.map((n) => ({ id: n.id })),
      { all: true, limit: 50 }
    );

    expect(result.isErr()).toBe(true);
    const error = result._unsafeUnwrapErr();
    // Must be a typed RateLimitError, not a generic Error with a stringified object
    expect(error).toBeInstanceOf(RateLimitError);
    expect(error.name).toBe('RateLimitError');
    expect(error.kind).toBe('RateLimitError');
    // Message should be the human-readable rate limit message, not a stringified Error object
    expect(error.message).toContain('rate limit');
    expect(error.message).not.toContain('[object Object]');
  });

  it('accumulates rows across pages and returns correct pageInfo on success', async () => {
    let callCount = 0;
    const requestFn = vi.fn((_query: string, _vars: Record<string, unknown>) => {
      callCount++;
      if (callCount === 1) {
        return Promise.resolve({
          items: {
            nodes: [{ id: 'r1' }, { id: 'r2' }],
            pageInfo: { hasNextPage: true, endCursor: 'cur1' },
          },
        });
      }
      return Promise.resolve({
        items: {
          nodes: [{ id: 'r3' }],
          pageInfo: { hasNextPage: false, endCursor: null },
        },
      });
    });

    const result = await fetchPaged(
      requestFn,
      'query',
      {},
      'items',
      (nodes: { id: string }[]) => nodes.map((n) => ({ id: n.id })),
      { all: true, limit: 50 }
    );

    expect(result.isOk()).toBe(true);
    const data = result._unsafeUnwrap();
    expect(data.rows).toHaveLength(3);
    expect(data.rows.map((r) => r.id)).toEqual(['r1', 'r2', 'r3']);
    expect(data.pageInfo.hasNextPage).toBe(false);
    expect(callCount).toBe(2);
  });
});
