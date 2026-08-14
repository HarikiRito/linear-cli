import type { Command } from 'commander';
import { addAuthOptions, isPlain } from '../../lib/commandOptions.js';
import { createDocument } from './create.js';
import { deleteDocument } from './delete.js';
import { getDocument } from './get.js';
import { listDocuments } from './list.js';
import { updateDocument } from './update.js';

export function registerDocuments(program: Command): void {
  const documents = program
    .command('documents')
    .description('Document commands: list, get, create, update, delete')
    .addHelpCommand(false);

  documents.action(() => {
    documents.help();
  });

  // documents list
  const listCmd = documents
    .command('list')
    .description('List documents (optionally scoped to a project)')
    .option('--project <id-or-name>', 'Filter by project ID or name')
    .option('--limit <n>', 'Number of documents per page (default: 50)', '50')
    .option('--after <cursor>', 'Fetch the next page starting after this cursor')
    .option('--all', 'Fetch all pages (one request per page)');

  addAuthOptions(listCmd).action(
    async (opts: {
      project?: string;
      limit: string;
      after?: string;
      all?: boolean;
      apiKey?: string;
      token?: string;
    }) => {
      await listDocuments({
        apiKey: opts.apiKey,
        token: opts.token,
        project: opts.project,
        limit: Math.max(1, Math.min(250, Number(opts.limit) || 50)),
        after: opts.after,
        all: !!opts.all,
        plain: isPlain(listCmd),
      });
    }
  );

  // documents get
  const getCmd = documents.command('get <id>').description('Get a single document by ID or slug');

  addAuthOptions(getCmd).action(async (id: string, opts: { apiKey?: string; token?: string }) => {
    await getDocument({
      apiKey: opts.apiKey,
      token: opts.token,
      id,
      plain: isPlain(getCmd),
    });
  });

  // documents create
  const createCmd = documents
    .command('create')
    .description('Create a new document')
    .requiredOption('--title <title>', 'Document title')
    .option('--project <id-or-name>', 'Project ID or name to associate the document with')
    .option('--content <text>', 'Document content as markdown (use "-" to read from stdin)')
    .option('--content-file <path>', 'Path to a file containing document content');

  addAuthOptions(createCmd).action(
    async (opts: {
      title: string;
      project?: string;
      content?: string;
      contentFile?: string;
      apiKey?: string;
      token?: string;
    }) => {
      await createDocument({
        apiKey: opts.apiKey,
        token: opts.token,
        title: opts.title,
        project: opts.project,
        content: opts.content,
        contentFile: opts.contentFile,
        plain: isPlain(createCmd),
      });
    }
  );

  // documents update
  const updateCmd = documents
    .command('update <id>')
    .description('Update an existing document by ID')
    .option('--title <title>', 'New document title')
    .option('--content <text>', 'New document content as markdown (use "-" to read from stdin)')
    .option('--content-file <path>', 'Path to a file containing new document content');

  addAuthOptions(updateCmd).action(
    async (
      id: string,
      opts: {
        title?: string;
        content?: string;
        contentFile?: string;
        apiKey?: string;
        token?: string;
      }
    ) => {
      await updateDocument({
        apiKey: opts.apiKey,
        token: opts.token,
        id,
        title: opts.title,
        content: opts.content,
        contentFile: opts.contentFile,
        plain: isPlain(updateCmd),
      });
    }
  );

  // documents delete
  const deleteCmd = documents
    .command('delete <id>')
    .description('Delete a document (permanent)')
    .option('--yes', 'Skip confirmation prompt');

  addAuthOptions(deleteCmd).action(
    async (id: string, opts: { yes?: boolean; apiKey?: string; token?: string }) => {
      await deleteDocument({
        apiKey: opts.apiKey,
        token: opts.token,
        id,
        yes: !!opts.yes,
      });
    }
  );
}
