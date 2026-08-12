import { execSync } from 'node:child_process';
import { ok, Result } from 'neverthrow';
import { KEEPALIVE_POLL_CRON } from '../../../lib/config.js';
import { toError } from '../../../lib/errors.js';
import { getLogPath, type KeepaliveScheduler } from './index.js';

export const KEEPALIVE_CRON_MARKER = '# linear-cli keepalive';

/** crontab -l; a missing crontab (exit != 0) reads as empty. */
function readCrontab(): string {
  return Result.fromThrowable(
    () => execSync('crontab -l', { encoding: 'utf-8' }).toString(),
    () => undefined
  )().unwrapOr('');
}

function writeCrontab(content: string): Result<void, Error> {
  return Result.fromThrowable(() => {
    execSync('crontab -', { input: content, encoding: 'utf-8' });
  }, toError)();
}

function scheduleLine(nodePath: string, cliPath: string): string {
  return `${KEEPALIVE_POLL_CRON} "${nodePath}" "${cliPath}" keepalive run --quiet >> "${getLogPath()}" 2>&1`;
}

export class CronBackend implements KeepaliveScheduler {
  isInstalled(): Result<boolean, Error> {
    return ok(readCrontab().includes(KEEPALIVE_CRON_MARKER));
  }

  install(nodePath: string, cliPath: string): Result<void, Error> {
    const current = readCrontab();
    if (current.includes(KEEPALIVE_CRON_MARKER)) {
      return ok(undefined); // already installed — idempotent
    }
    const next = `${current}\n${KEEPALIVE_CRON_MARKER}\n${scheduleLine(nodePath, cliPath)}\n`;
    return writeCrontab(next);
  }

  uninstall(): Result<void, Error> {
    const current = readCrontab();
    if (!current.includes(KEEPALIVE_CRON_MARKER)) {
      return ok(undefined); // not installed — no-op
    }
    const lines = current.split('\n');
    const next: string[] = [];
    let removing = false;
    for (const line of lines) {
      if (removing) {
        removing = false;
        // Only drop the line if it is our schedule line.
        if (!line.trim().startsWith(KEEPALIVE_POLL_CRON)) next.push(line);
        continue;
      }
      if (line.trim() === KEEPALIVE_CRON_MARKER) {
        removing = true;
        continue;
      }
      next.push(line);
    }
    return writeCrontab(next.join('\n'));
  }

  status(): Result<{ installed: boolean; detail: string }, Error> {
    const lines = readCrontab().split('\n');
    const idx = lines.findIndex((l) => l.trim() === KEEPALIVE_CRON_MARKER);
    if (idx === -1) return ok({ installed: false, detail: 'not installed' });
    const schedule = lines[idx + 1]?.trim() ?? '';
    return ok({ installed: true, detail: schedule });
  }
}
