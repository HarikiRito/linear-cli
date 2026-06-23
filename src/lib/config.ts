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

// Default state filter tokens (snake_case). Used by issues subcommands unless overridden.
// Underscores are converted to spaces when building the GraphQL eqIgnoreCase filter.
export const DEFAULT_ISSUE_STATES = ['todo', 'in_progress', 'dev_review'] as const;
