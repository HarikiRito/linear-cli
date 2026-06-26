import { ValidationError } from '../../lib/errors.js';
import { exitError } from '../../lib/runner.js';

export interface SearchDocumentationOptions {
  query: string;
}

const NOT_SUPPORTED_MESSAGE =
  'search-documentation is not supported: Linear does not expose a public API ' +
  'for searching its product documentation (linear.app/docs). ' +
  'No GraphQL query and no stable public HTTPS endpoint are available.';

export function searchDocumentation(_opts: SearchDocumentationOptions): void {
  exitError(new ValidationError(NOT_SUPPORTED_MESSAGE));
}
