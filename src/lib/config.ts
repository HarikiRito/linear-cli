import path from 'node:path';
import { getGlobalConfigDir } from './scope.js';

// Embedded OAuth client ID for the Linear CLI application.
// This is a public client (PKCE flow — no secret required).
// Can be overridden via LINEAR_CLIENT_ID for development/testing.
export const DEFAULT_CLIENT_ID = '376b5a4327178c99fde2d9aebdc65e8b';

export function getClientId(): string {
  return process.env.LINEAR_CLIENT_ID ?? DEFAULT_CLIENT_ID;
}

export const LINEAR_AUTHORIZE_URL = 'https://linear.app/oauth/authorize';
export const LINEAR_TOKEN_URL = 'https://api.linear.app/oauth/token';
export const CALLBACK_PATH = '/callback';
export const CANDIDATE_PORTS = [9876, 9877, 9878] as const;

// Keepalive: automatic refresh-token rotation to keep sessions alive.
export const KEEPALIVE_INTERVAL_MS = 24 * 60 * 60 * 1000;
/** Backoff schedule (ms) for invalid_grant retries; last entry is the cap. */
export const KEEPALIVE_BACKOFF_MS = [15 * 60_000, 60 * 60_000, 4 * 60 * 60_000, 24 * 60 * 60_000];
export const KEEPALIVE_POLL_CRON = '*/15 * * * *';
export const KEEPALIVE_TASK_NAME = 'linear-cli-keepalive';
/** Subdir under the global config dir holding one lock file per workspace. */
export const KEEPALIVE_LOCK_DIRNAME = 'keepalive';
export const KEEPALIVE_LOG_FILE = 'keepalive.log';

export function getKeepaliveLockDir(): string {
  return path.join(getGlobalConfigDir(), KEEPALIVE_LOCK_DIRNAME);
}

/** Per-workspace rotation lock: <config>/keepalive/<workspaceId>.lock */
export function getWorkspaceLockPath(workspaceId: string): string {
  return path.join(getKeepaliveLockDir(), `${workspaceId}.lock`);
}

// Hosts Linear itself serves attachment assets from. Only these (and their
// subdomains) are safe to receive the CLI's live Linear credentials — an
// attachment's `url` can be an arbitrary external link, so it must never be
// trusted with the Authorization header by default.
export const TRUSTED_ATTACHMENT_HOSTS = ['uploads.linear.app'] as const;

export function isTrustedAttachmentHost(hostname: string): boolean {
  return TRUSTED_ATTACHMENT_HOSTS.some(
    (host) => hostname === host || hostname.endsWith(`.${host}`)
  );
}

// Default state filter tokens (snake_case). Used by issues subcommands unless overridden.
// Underscores are converted to spaces when building the GraphQL eqIgnoreCase filter.
export const DEFAULT_ISSUE_STATES = ['todo', 'in_progress', 'dev_review'] as const;
