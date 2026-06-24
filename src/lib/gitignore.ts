import fs from 'node:fs';
import path from 'node:path';
import { err, ok, Result } from 'neverthrow';
import { toError } from './errors.js';

const AUTH_ENTRY = '.linear/auth.json';

/**
 * Append `.linear/auth.json` to the project root's .gitignore, idempotently.
 * Creates the file if it does not exist.
 */
export function appendAuthToGitignore(projectRoot: string): Result<void, Error> {
  const gitignorePath = path.join(projectRoot, '.gitignore');

  // Read existing content; ENOENT means file doesn't exist — treat as empty
  const readResult = Result.fromThrowable(
    () => fs.readFileSync(gitignorePath, 'utf-8'),
    (e) => e as NodeJS.ErrnoException
  )();

  let content: string;
  if (readResult.isErr()) {
    if (readResult.error.code !== 'ENOENT') {
      return err(readResult.error);
    }
    content = '';
  } else {
    content = readResult.value;
  }

  // Check if already present (any line that equals the entry, trimmed)
  const lines = content.split('\n');
  const alreadyPresent = lines.some((l) => l.trim() === AUTH_ENTRY);
  if (alreadyPresent) return ok(undefined);

  // Append with trailing newline
  const newContent =
    content === '' || content.endsWith('\n')
      ? `${content}${AUTH_ENTRY}\n`
      : `${content}\n${AUTH_ENTRY}\n`;

  return Result.fromThrowable(
    () => fs.writeFileSync(gitignorePath, newContent, 'utf-8'),
    toError
  )();
}
