import { execFileSync } from 'node:child_process';
import { ok, Result } from 'neverthrow';
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

export class TaskSchedulerBackend implements KeepaliveScheduler {
  isInstalled(): Result<boolean, Error> {
    return ok(runSchTasks(['/query', '/tn', KEEPALIVE_TASK_NAME]).isOk());
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
    return runSchTasks(['/delete', '/tn', KEEPALIVE_TASK_NAME, '/f']).map(() => undefined);
  }

  status(): Result<{ installed: boolean; detail: string }, Error> {
    const result = runSchTasks(['/query', '/tn', KEEPALIVE_TASK_NAME]);
    if (result.isErr()) return ok({ installed: false, detail: 'not installed' });
    return ok({ installed: true, detail: result.value.trim() });
  }
}
