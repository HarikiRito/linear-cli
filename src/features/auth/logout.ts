import pc from 'picocolors';
import { exitError } from '../../lib/runner.js';
import { findProjectRoot } from '../../lib/scope.js';
import { unregisterProject } from '../keepalive/registry.js';
import { deleteProjectSession, deleteSession, readProjectSession } from './session.js';

export function runLogout(): void {
  const projectRoot = findProjectRoot(process.cwd());
  const hasProjectSession = projectRoot !== null && readProjectSession(projectRoot) !== null;

  const result = hasProjectSession ? deleteProjectSession(projectRoot) : deleteSession();
  if (result.isErr()) {
    console.error(pc.red(`Logout failed: ${result.error.message}`));
    exitError(result.error);
    return;
  }
  if (hasProjectSession && projectRoot) {
    // Keepalive registry cleanup — idempotent, never blocks logout.
    void unregisterProject(projectRoot);
  }
  console.log(hasProjectSession ? 'Logged out of project scope.' : 'Logged out successfully.');
}
