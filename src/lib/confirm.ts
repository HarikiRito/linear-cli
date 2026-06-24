import { ValidationError } from './errors.js';

export interface ConfirmResult {
  proceed: boolean;
  error?: ValidationError;
}

/**
 * Gate a destructive operation behind a confirmation.
 * - If yes=true: proceed immediately (agent-first path).
 * - If non-TTY and yes=false: return an error (agent must pass --yes).
 * - If TTY and yes=false: prompt interactively; proceed only on "y".
 */
export async function confirmDestructive(
  message: string,
  yes: boolean
): Promise<ConfirmResult> {
  if (yes) return { proceed: true };

  if (!process.stdin.isTTY) {
    return {
      proceed: false,
      error: new ValidationError(
        `${message} Pass --yes to confirm non-interactively.`
      ),
    };
  }

  process.stdout.write(`${message} [y/N] `);
  const answer = await new Promise<string>((resolve) => {
    process.stdin.setEncoding('utf8');
    let buf = '';
    const onData = (chunk: string) => {
      buf += chunk;
      if (buf.includes('\n')) {
        process.stdin.removeListener('data', onData);
        resolve(buf.trim());
      }
    };
    process.stdin.on('data', onData);
    process.stdin.resume();
  });

  return { proceed: answer.toLowerCase() === 'y' };
}
