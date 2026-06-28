import { ok } from 'neverthrow';
import { afterEach, describe, expect, it, vi } from 'vitest';

afterEach(() => {
  vi.restoreAllMocks();
  vi.clearAllMocks();
  vi.resetModules();
  process.exitCode = undefined;
});

describe('favoriteIssue', () => {
  it('calls createFavorite with resolved issue ID', async () => {
    const createFavoriteFn = vi.fn().mockResolvedValue({ success: true });
    vi.doMock('../../../lib/client/index.js', () => ({
      getClientWithAuthRetry: vi.fn().mockReturnValue(ok({ createFavorite: createFavoriteFn })),
      getRequestFn: vi.fn(),
    }));
    vi.doMock('../../../lib/runner.js', () => ({ exitError: vi.fn() }));

    const { favoriteIssue } = await import('../favorite/favorite.js');
    await favoriteIssue({ issue: 'ENG-1' });

    expect(createFavoriteFn).toHaveBeenCalledWith({ issueId: 'ENG-1' });
  });
});

describe('unfavoriteIssue', () => {
  it('finds matching favorite and calls deleteFavorite', async () => {
    const deleteFavoriteFn = vi.fn().mockResolvedValue({ success: true });
    const requestFn = vi.fn().mockResolvedValue({
      favorites: {
        nodes: [
          { id: 'fav-uuid-1', type: 'issue', issue: { id: 'other-uuid', identifier: 'ENG-2' } },
          { id: 'fav-uuid-2', type: 'issue', issue: { id: 'issue-uuid-1', identifier: 'ENG-1' } },
        ],
      },
    });
    vi.doMock('../../../lib/client/index.js', () => ({
      getClientWithAuthRetry: vi.fn().mockReturnValue(ok({ deleteFavorite: deleteFavoriteFn })),
      getRequestFn: vi.fn().mockReturnValue(requestFn),
    }));
    vi.doMock('../../../lib/runner.js', () => ({ exitError: vi.fn() }));

    const { unfavoriteIssue } = await import('../favorite/favorite.js');
    await unfavoriteIssue({ issue: 'ENG-1' });

    expect(deleteFavoriteFn).toHaveBeenCalledWith('fav-uuid-2');
  });

  it('exits with error when issue is not in favorites', async () => {
    const deleteFavoriteFn = vi.fn();
    const exitErrorMock = vi.fn();
    const requestFn = vi.fn().mockResolvedValue({
      favorites: {
        nodes: [
          { id: 'fav-uuid-1', type: 'project', issue: null },
        ],
      },
    });
    vi.doMock('../../../lib/client/index.js', () => ({
      getClientWithAuthRetry: vi.fn().mockReturnValue(ok({ deleteFavorite: deleteFavoriteFn })),
      getRequestFn: vi.fn().mockReturnValue(requestFn),
    }));
    vi.doMock('../../../lib/runner.js', () => ({ exitError: exitErrorMock }));

    const { unfavoriteIssue } = await import('../favorite/favorite.js');
    await unfavoriteIssue({ issue: 'ENG-99' });

    expect(exitErrorMock).toHaveBeenCalled();
    expect(deleteFavoriteFn).not.toHaveBeenCalled();
  });
});
