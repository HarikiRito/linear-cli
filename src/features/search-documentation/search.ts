import { ValidationError } from '../../lib/errors.js';
import { printJson } from '../../lib/output/json.js';
import { exitError } from '../../lib/runner.js';

export interface SearchDocumentationOptions {
  query: string;
  json: boolean;
  pretty: boolean;
}

const NOT_SUPPORTED_MESSAGE =
  'search-documentation is not supported: Linear does not expose a public API ' +
  'for searching its product documentation (linear.app/docs). ' +
  'No GraphQL query and no stable public HTTPS endpoint are available.';

export function searchDocumentation(opts: SearchDocumentationOptions): void {
  if (opts.json) {
    printJson({ error: NOT_SUPPORTED_MESSAGE }, opts.pretty);
    process.exitCode = 1;
    return;
  }
  exitError(new ValidationError(NOT_SUPPORTED_MESSAGE));
}
