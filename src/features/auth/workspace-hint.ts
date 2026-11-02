export type WorkspaceHint = { kind: 'team'; key: string } | { kind: 'url'; urlKey: string };

const ISSUE_URL =
  /^https?:\/\/linear\.app\/([^/\s]+)\/issue\/([A-Za-z][A-Za-z0-9]*-\d+)(?:[/?#]|$)/;
const ISSUE_ID = /^([A-Za-z][A-Za-z0-9]*)-\d+$/;
const TEAM_KEY = /^[A-Za-z][A-Za-z0-9]{0,9}$/;

// Set only by the root preAction hook in program.ts, once per command.
let current: WorkspaceHint | null = null;

export function setWorkspaceHint(hint: WorkspaceHint | null): void {
  current = hint;
}

export function getWorkspaceHint(): WorkspaceHint | null {
  return current;
}

/** Issue identifier and workspace url key of a Linear issue URL; null for anything else. */
export function parseIssueUrl(input: string): { urlKey: string; identifier: string } | null {
  const match = ISSUE_URL.exec(input);
  return match ? { urlKey: match[1], identifier: match[2] } : null;
}

/** Workspace hint from a command's positional args and `--team` value: issue URL, then team flag, then issue id prefix. */
export function deriveWorkspaceHint(args: string[], team?: string): WorkspaceHint | null {
  for (const arg of args) {
    const parsed = parseIssueUrl(arg);
    if (parsed) return { kind: 'url', urlKey: parsed.urlKey };
  }
  if (team && TEAM_KEY.test(team)) return { kind: 'team', key: team.toUpperCase() };
  for (const arg of args) {
    const match = ISSUE_ID.exec(arg);
    if (match) return { kind: 'team', key: match[1].toUpperCase() };
  }
  return null;
}
