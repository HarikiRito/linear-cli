import { execFileSync } from 'node:child_process';
import { err, ok, Result } from 'neverthrow';
import { KEEPALIVE_TASK_NAME } from '../../../lib/config.js';
import { toError } from '../../../lib/errors.js';
import { getLogPath, type KeepaliveScheduler } from './index.js';

const SCHTASKS = 'schtasks.exe';

function runSchTasks(args: string[]): Result<string, Error> {
  return Result.fromThrowable(
    () => execFileSync(SCHTASKS, args, { encoding: 'utf-8', stdio: ['ignore', 'pipe', 'ignore'] }),
    toError
  )();
}

/**
 * schtasks reports a missing task via stderr/stdout messages like
 * "ERROR: The system cannot find the file specified." or
 * "ERROR: Cannot find the task" — both contain "cannot find".
 */
function isTaskNotFoundError(error: Error): boolean {
  const message = error.message.toLowerCase();
  return message.includes('cannot find') || message.includes('not exist');
}

export class TaskSchedulerBackend implements KeepaliveScheduler {
  isInstalled(): Result<boolean, Error> {
    const query = runSchTasks(['/query', '/tn', KEEPALIVE_TASK_NAME]);
    if (query.isOk()) return ok(true);
    // Absent task → not installed; anything else (access denied, transient) propagates.
    return isTaskNotFoundError(query.error) ? ok(false) : err(query.error);
  }

  install(nodePath: string, cliPath: string): Result<void, Error> {
    const task = `cmd /c ""${nodePath}" "${cliPath}" keepalive run --quiet >> "${getLogPath()}" 2>&1"`;
    return runSchTasks([
      '/create',
      '/tn',
      KEEPALIVE_TASK_NAME,
      '/sc',
      'minute',
      '/mo',
      '15',
      '/tr',
      task,
      '/f',
    ]).map(() => undefined);
  }

  uninstall(): Result<void, Error> {
    // Idempotent when the task is absent; propagate non-not-found errors.
    return this.isInstalled().andThen((installed) => {
      if (!installed) return ok(undefined);
      return runSchTasks(['/delete', '/tn', KEEPALIVE_TASK_NAME, '/f']).map(() => undefined);
    });
  }

  status(): Result<{ installed: boolean; detail: string }, Error> {
    const result = runSchTasks(['/query', '/tn', KEEPALIVE_TASK_NAME]);
    if (result.isErr()) return ok({ installed: false, detail: 'not installed' });
    return ok({ installed: true, detail: result.value.trim() });
  }
}
