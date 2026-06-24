import type { Command } from 'commander';
import { addJsonOptions } from '../../lib/commandOptions.js';
import { searchDocumentation } from './search.js';

export function registerSearchDocumentation(program: Command): void {
  const cmd = program
    .command('search-documentation <query>')
    .description(
      'Search Linear product documentation (linear.app/docs).\n' +
        'NOTE: This command is not currently supported — Linear does not expose\n' +
        'a public API for searching its help/product documentation. No GraphQL\n' +
        'query and no stable public HTTPS search endpoint are available.'
    );

  addJsonOptions(cmd).action((query: string, opts: { json?: boolean; pretty?: boolean }) => {
    searchDocumentation({ query, json: !!opts.json, pretty: !!opts.pretty });
  });
}
