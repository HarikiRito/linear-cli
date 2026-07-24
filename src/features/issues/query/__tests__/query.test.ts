import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../../lib/client/index.js', () => ({
  getClientWithAuthRetry: vi.fn(),
  getRequestFn: vi.fn(),
}));

import { ok } from 'neverthrow';
import { getClientWithAuthRetry, getRequestFn } from '../../../../lib/client/index.js';
import { queryIssues } from '../query.js';

// A syntactically valid UUID so resolveProject() short-circuits via
// looksLikeId() without needing a real client.projects() call.
const FAKE_PROJECT_ID = '11111111-1111-1111-1111-111111111111';

interface FakeIssueNode {
  identifier: string;
  title: string;
  description?: string | null;
  state: { name: string };
  assignee: { displayName: string } | null;
}

function makeSearchResponse(nodes: FakeIssueNode[]) {
  return {
    searchIssues: {
      nodes,
      pageInfo: { hasNextPage: false, endCursor: null },
    },
  };
}

describe('queryIssues', () => {
  let logSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.mocked(getClientWithAuthRetry).mockResolvedValue(ok({}) as any);
  });

  afterEach(() => {
    logSpy.mockRestore();
  });

  const clusterNodes: FakeIssueNode[] = [
    {
      identifier: 'ENG-1',
      title: 'Batch review pipeline for code submissions',
      state: { name: 'Todo' },
      assignee: null,
    },
    {
      identifier: 'ENG-2',
      title: 'Single review workflow for small diffs',
      state: { name: 'Todo' },
      assignee: null,
    },
    {
      identifier: 'ENG-3',
      title: 'Review comments UI polish',
      state: { name: 'Todo' },
      assignee: null,
    },
    {
      identifier: 'ENG-4',
      title: 'GitHub review integration',
      state: { name: 'Todo' },
      assignee: null,
    },
    {
      identifier: 'ENG-5',
      title: 'GitHub webhook ingestion pipeline',
      state: { name: 'Todo' },
      assignee: null,
    },
  ];

  it('different unrelated terms against the same project return meaningfully different result sets', async () => {
    // The real Linear searchIssues resolver ranks by relevance but does not
    // strictly filter — simulate that by returning the *same* full cluster
    // for every term, regardless of what was searched for (H-321 repro).
    const requestFn = vi.fn().mockResolvedValue(makeSearchResponse(clusterNodes));
    vi.mocked(getRequestFn).mockReturnValue(requestFn);

    async function run(term: string): Promise<string[]> {
      logSpy.mockClear();
      await queryIssues({
        term,
        project: FAKE_PROJECT_ID,
        limit: 50,
        all: false,
        plain: true,
        states: [],
        allStates: true,
      });
      const output = logSpy.mock.calls.map((c) => c[0]).join('\n');
      return [...output.matchAll(/Issue: (\S+)/g)].map((m) => m[1]);
    }

    const batch = await run('batch review');
    const single = await run('single review');
    const comments = await run('review comments');
    const github = await run('GitHub review');

    expect(batch).toEqual(['ENG-1']);
    expect(single).toEqual(['ENG-2']);
    expect(comments).toEqual(['ENG-3']);
    expect(github).toEqual(['ENG-4']);

    // None of the unrelated queries should surface the textually-unrelated issue.
    expect(batch).not.toContain('ENG-5');
    expect(single).not.toContain('ENG-5');
    expect(comments).not.toContain('ENG-5');
    expect(github).not.toContain('ENG-5');

    // The four term result sets must actually differ from one another.
    expect(new Set([...batch, ...single, ...comments, ...github]).size).toBeGreaterThan(1);
  });

  it('still passes term and filter through to the searchIssues request', async () => {
    const requestFn = vi.fn().mockResolvedValue(makeSearchResponse(clusterNodes));
    vi.mocked(getRequestFn).mockReturnValue(requestFn);

    await queryIssues({
      term: 'batch review',
      project: FAKE_PROJECT_ID,
      limit: 50,
      all: false,
      plain: true,
      states: [],
      allStates: true,
    });

    expect(requestFn).toHaveBeenCalledTimes(1);
    const [, variables] = requestFn.mock.calls[0];
    expect(variables.term).toBe('batch review');
    expect(variables.filter).toBeDefined();
  });
});
