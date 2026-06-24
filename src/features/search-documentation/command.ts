import type { Command } from 'commander';
import { searchDocumentation } from './search.js';

export function registerSearchDocumentation(program: Command): void {
  program
    .command('search-documentation <query>')
    .description(
      'Search Linear product documentation (linear.app/docs).\n' +
        'NOTE: This command is not currently supported — Linear does not expose\n' +
        'a public API for searching its help/product documentation. No GraphQL\n' +
        'query and no stable public HTTPS search endpoint are available.'
    )
    .option('--json', 'Output as JSON')
    .action((query: string, opts: { json?: boolean }) => {
      searchDocumentation({ query, json: !!opts.json });
    });
}
