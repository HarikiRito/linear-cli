import { describe, expect, it } from 'vitest';
import { AuthError, mapLinearError, NetworkError, RateLimitError } from '../src/lib/errors.js';

describe('mapLinearError', () => {
  it('maps RATELIMITED message to RateLimitError', () => {
    const mapped = mapLinearError(new Error('RATELIMITED: too many requests'));
    expect(mapped).toBeInstanceOf(RateLimitError);
    expect(mapped.message).toContain('rate limit');
  });

  it('maps fetch failed TypeError to NetworkError', () => {
    const mapped = mapLinearError(new TypeError('fetch failed'));
    expect(mapped).toBeInstanceOf(NetworkError);
    expect(mapped.message).toContain('Network error');
  });

  it('maps ECONNREFUSED to NetworkError', () => {
    const mapped = mapLinearError(new Error('ECONNREFUSED 127.0.0.1:443'));
    expect(mapped).toBeInstanceOf(NetworkError);
  });

  it('maps ETIMEDOUT to NetworkError', () => {
    const mapped = mapLinearError(new Error('ETIMEDOUT'));
    expect(mapped).toBeInstanceOf(NetworkError);
  });

  it('maps unknown errors to AuthError', () => {
    const mapped = mapLinearError(new Error('Something unexpected'));
    expect(mapped).toBeInstanceOf(AuthError);
    expect(mapped.message).toBe('Something unexpected');
  });

  it('wraps non-Error values in AuthError', () => {
    const mapped = mapLinearError('a string error');
    expect(mapped).toBeInstanceOf(AuthError);
    expect(mapped.message).toBe('a string error');
  });
});
