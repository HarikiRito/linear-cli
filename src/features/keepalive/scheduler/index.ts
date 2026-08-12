import path from 'node:path';
import type { Result } from 'neverthrow';
import { KEEPALIVE_LOG_FILE } from '../../../lib/config.js';
import { getGlobalConfigDir } from '../../../lib/scope.js';
import { CronBackend } from './cron.js';
import { TaskSchedulerBackend } from './taskscheduler.js';

export interface KeepaliveScheduler {
  isInstalled(): Result<boolean, Error>;
  install(nodePath: string, cliPath: string): Result<void, Error>;
  uninstall(): Result<void, Error>;
  status(): Result<{ installed: boolean; detail: string }, Error>;
}

export function getScheduler(): KeepaliveScheduler {
  return process.platform === 'win32' ? new TaskSchedulerBackend() : new CronBackend();
}

export function getLogPath(): string {
  return path.join(getGlobalConfigDir(), KEEPALIVE_LOG_FILE);
}
