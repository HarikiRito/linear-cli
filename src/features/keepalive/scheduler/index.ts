import path from 'node:path';
import type { Result } from 'neverthrow';
import { KEEPALIVE_LOG_FILE } from '../../../lib/config.js';
import { getGlobalConfigDir } from '../../../lib/scope.js';
import { CronBackend } from './cron.js';
import { TaskSchedulerBackend } from './taskscheduler.js';

export interface SchedulerStatus {
  installed: boolean;
  detail: string;
  /** Parsed from the schedule entry when recognizable; undefined when the format can't be parsed. */
  nodePath?: string;
  cliPath?: string;
}

export interface KeepaliveScheduler {
  isInstalled(): Result<boolean, Error>;
  install(nodePath: string, cliPath: string): Result<void, Error>;
  uninstall(): Result<void, Error>;
  status(): Result<SchedulerStatus, Error>;
}

export function getScheduler(): KeepaliveScheduler {
  return process.platform === 'win32' ? new TaskSchedulerBackend() : new CronBackend();
}

/**
 * Read-only, non-throwing: is the keepalive scheduler currently installed?
 * Any error (e.g. crontab access denied) reads as "not installed".
 */
export function isKeepaliveInstalled(): boolean {
  const result = getScheduler().isInstalled();
  return result.isErr() ? false : result.value;
}

export function getLogPath(): string {
  return path.join(getGlobalConfigDir(), KEEPALIVE_LOG_FILE);
}
