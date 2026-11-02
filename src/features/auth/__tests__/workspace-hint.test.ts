import { describe, expect, it } from 'vitest';
import { deriveWorkspaceHint, parseIssueUrl } from '../workspace-hint.js';

describe('deriveWorkspaceHint', () => {
  it('issue id gives an upper-cased team key', () => {
    expect(deriveWorkspaceHint(['eng-123'])).toEqual({ kind: 'team', key: 'ENG' });
  });

  it('bare number gives no hint', () => {
    expect(deriveWorkspaceHint(['123'])).toBeNull();
  });

  it('--team key gives a team hint, a UUID gives none', () => {
    expect(deriveWorkspaceHint([], 'eng')).toEqual({ kind: 'team', key: 'ENG' });
    expect(deriveWorkspaceHint([], '0b6f6a52-1c0e-4f6c-9d1e-6f0c7f3f2a11')).toBeNull();
  });

  it('issue URL gives its workspace url key and wins over --team and ids', () => {
    expect(
      deriveWorkspaceHint(['OPS-1', 'https://linear.app/acme/issue/ENG-123/some-slug'], 'XYZ')
    ).toEqual({ kind: 'url', urlKey: 'acme' });
  });

  it('--team wins over an issue id', () => {
    expect(deriveWorkspaceHint(['ENG-1'], 'OPS')).toEqual({ kind: 'team', key: 'OPS' });
  });
});

describe('parseIssueUrl', () => {
  it('extracts url key and identifier', () => {
    expect(parseIssueUrl('https://linear.app/acme/issue/ENG-123')).toEqual({
      urlKey: 'acme',
      identifier: 'ENG-123',
    });
  });

  it('rejects non-issue URLs', () => {
    expect(parseIssueUrl('https://linear.app/acme/project/foo')).toBeNull();
    expect(parseIssueUrl('ENG-123')).toBeNull();
  });
});
