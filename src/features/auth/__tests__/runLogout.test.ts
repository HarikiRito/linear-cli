import { afterEach, describe, expect, it, vi } from 'vitest';

/**
 * Tests for runLogout() scope branching:
 * - project root found AND project session exists → deletes project session only
 * - project root found but NO project session → deletes global session only
 * - no project root → deletes global session only
 */

vi.mock('../../../lib/scope.js', () => ({
  findProjectRoot: vi.fn(),
}));

vi.mock('../session.js', () => ({
  deleteProjectSession: vi.fn().mockReturnValue({ isErr: () => false, isOk: () => true }),
  deleteSession: vi.fn().mockReturnValue({ isErr: () => false, isOk: () => true }),
  readProjectSession: vi.fn(),
}));

vi.mock('../../../lib/runner.js', () => ({
  exitError: vi.fn(),
}));

import { findProjectRoot } from '../../../lib/scope.js';
import { runLogout } from '../logout.js';
import { deleteProjectSession, deleteSession, readProjectSession } from '../session.js';

const mockFindProjectRoot = vi.mocked(findProjectRoot);
const mockDeleteProjectSession = vi.mocked(deleteProjectSession);
const mockDeleteSession = vi.mocked(deleteSession);
const mockReadProjectSession = vi.mocked(readProjectSession);

describe('runLogout — scope branching', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('calls deleteProjectSession (not deleteSession) when inside a project root with a project session', () => {
    mockFindProjectRoot.mockReturnValue('/some/project');
    mockReadProjectSession.mockReturnValue({ apiKey: 'proj-key' });

    runLogout();

    expect(mockDeleteProjectSession).toHaveBeenCalledOnce();
    expect(mockDeleteProjectSession).toHaveBeenCalledWith('/some/project');
    expect(mockDeleteSession).not.toHaveBeenCalled();
  });

  it('calls deleteSession (not deleteProjectSession) when project root exists but no project session', () => {
    mockFindProjectRoot.mockReturnValue('/some/project');
    mockReadProjectSession.mockReturnValue(null);

    runLogout();

    expect(mockDeleteSession).toHaveBeenCalledOnce();
    expect(mockDeleteProjectSession).not.toHaveBeenCalled();
  });

  it('calls deleteSession (not deleteProjectSession) when outside any project root', () => {
    mockFindProjectRoot.mockReturnValue(null);

    runLogout();

    expect(mockDeleteSession).toHaveBeenCalledOnce();
    expect(mockDeleteProjectSession).not.toHaveBeenCalled();
  });
});
