export class UnauthenticatedError extends Error {
  readonly kind = 'UnauthenticatedError' as const;
  constructor() {
    super(
      'No credentials found. Pass --api-key or --token, set LINEAR_API_KEY or LINEAR_ACCESS_TOKEN, or run `linear login`.'
    );
    this.name = 'UnauthenticatedError';
  }
}

export class RateLimitError extends Error {
  readonly kind = 'RateLimitError' as const;
  constructor() {
    super('Linear rate limit reached. Please wait before retrying.');
    this.name = 'RateLimitError';
  }
}

export class NetworkError extends Error {
  readonly kind = 'NetworkError' as const;
  constructor(message: string) {
    super(`Network error: ${message}`);
    this.name = 'NetworkError';
  }
}

export class AuthError extends Error {
  readonly kind = 'AuthError' as const;
  constructor(message: string) {
    super(message);
    this.name = 'AuthError';
  }
}

export type CliError = UnauthenticatedError | RateLimitError | NetworkError | AuthError;

export function mapLinearError(err: unknown): CliError {
  if (err instanceof Error) {
    // Linear returns HTTP 400 with code/message RATELIMITED (not 429).
    if (err.message.includes('RATELIMITED')) {
      return new RateLimitError();
    }
    if (
      err.message.includes('fetch failed') ||
      err.message.includes('ECONNREFUSED') ||
      err.message.includes('ETIMEDOUT') ||
      err.name === 'FetchError' ||
      err instanceof TypeError
    ) {
      return new NetworkError(err.message);
    }
    if (
      err.message.toLowerCase().includes('unauthorized') ||
      err.message.toLowerCase().includes('authentication') ||
      err.message.includes('401')
    ) {
      return new AuthError(err.message);
    }
  }
  return new AuthError(err instanceof Error ? err.message : String(err));
}
