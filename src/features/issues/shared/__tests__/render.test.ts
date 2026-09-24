import { afterEach, describe, expect, it, vi } from 'vitest';
import type { IssueNode } from '../render.js';
import { renderIssues, toIssueRows } from '../render.js';

describe('toIssueRows (H-638 field parity with issues get)', () => {
  it('maps parent, project, and url from the raw node', () => {
    const nodes: IssueNode[] = [
      {
        identifier: 'H-630',
        title: 'Some issue',
        state: { name: 'Todo' },
        assignee: null,
        priority: 1,
        url: 'https://linear.app/hariki/issue/H-630/some-issue',
        project: { name: 'AI Code Review' },
        parent: { identifier: 'H-623' },
      },
    ];

    const [row] = toIssueRows(nodes);
    expect(row.url).toBe('https://linear.app/hariki/issue/H-630/some-issue');
    expect(row.project).toBe('AI Code Review');
    expect(row.parent).toBe('H-623');
  });

  it('coerces missing parent/project/url to null', () => {
    const nodes: IssueNode[] = [
      {
        identifier: 'H-631',
        title: 'No relations',
        state: null,
        assignee: null,
        priority: 0,
      },
    ];

    const [row] = toIssueRows(nodes);
    expect(row.url).toBeNull();
    expect(row.project).toBeNull();
    expect(row.parent).toBeNull();
  });
});

describe('renderIssues --plain includes parent/project/url (H-638)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('emits parent, project, and url fields in plain output', () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    renderIssues(
      {
        issues: [
          {
            identifier: 'H-630',
            title: 'Some issue',
            state: 'Todo',
            assignee: '',
            priority: 1,
            trashed: false,
            archivedAt: null,
            labels: [],
            url: 'https://linear.app/hariki/issue/H-630/some-issue',
            project: 'AI Code Review',
            parent: 'H-623',
            blockedBy: [],
            blocking: [],
          },
        ],
        pageInfo: { hasNextPage: false, endCursor: null },
      },
      true
    );

    const output = logSpy.mock.calls.map((c) => c[0]).join('\n');
    expect(output).toContain('project: AI Code Review');
    expect(output).toContain('url: https://linear.app/hariki/issue/H-630/some-issue');
    expect(output).toContain('parent: H-623');
  });

  it('omits parent/project/url lines when the issue has none', () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    renderIssues(
      {
        issues: [
          {
            identifier: 'H-631',
            title: 'No relations',
            state: 'Todo',
            assignee: '',
            priority: 0,
            trashed: false,
            archivedAt: null,
            labels: [],
            url: null,
            project: null,
            parent: null,
            blockedBy: [],
            blocking: [],
          },
        ],
        pageInfo: { hasNextPage: false, endCursor: null },
      },
      true
    );

    const output = logSpy.mock.calls.map((c) => c[0]).join('\n');
    expect(output).not.toContain('project:');
    expect(output).not.toContain('url:');
    expect(output).not.toContain('parent:');
  });
});
