import pc from 'picocolors';
import { exitError } from '../../lib/runner.js';
import { deleteSession } from './session.js';

export function runLogout(): void {
  const result = deleteSession();
  if (result.isErr()) {
    console.error(pc.red(`Logout failed: ${result.error.message}`));
    exitError(result.error);
    return;
  }
  console.log('Logged out successfully.');
}
