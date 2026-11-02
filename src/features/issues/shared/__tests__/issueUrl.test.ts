import type { LinearClient } from '@linear/sdk';
import { describe, expect, it } from 'vitest';
import { resolveIssueIdentifier } from '../resolve.js';

describe('resolveIssueIdentifier', () => {
  it('accepts a Linear issue URL and returns its identifier', async () => {
    const result = await resolveIssueIdentifier(
      'https://linear.app/acme/issue/ENG-123/some-slug',
      {} as LinearClient
    );
    expect(result._unsafeUnwrap()).toBe('ENG-123');
  });
});
