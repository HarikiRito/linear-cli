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

/**
 * True if the schedule line already targets this exact nodePath + cliPath.
 * Token-exact: quoted tokens must equal — guards against substring false
 * matches (e.g. /old/store/linear.js vs /store/linear.js).
 */
function matchesSchedule(line: string, nodePath: string, cliPath: string): boolean {
  const tokens = line.trim().split(/\s+/);
  return tokens.includes(`"${nodePath}"`) && tokens.includes(`"${cliPath}"`);
}

/** Strip the marker + schedule-line block; keeps all other crontab content. */
function removeKeepaliveBlock(content: string): string {
  const lines = content.split('\n');
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
  return next.join('\n');
}

export class CronBackend implements KeepaliveScheduler {
  isInstalled(): Result<boolean, Error> {
    return ok(readCrontab().includes(KEEPALIVE_CRON_MARKER));
  }

  install(nodePath: string, cliPath: string): Result<void, Error> {
    const current = readCrontab();
    if (current.includes(KEEPALIVE_CRON_MARKER)) {
      const lines = current.split('\n');
      const idx = lines.findIndex((l) => l.trim() === KEEPALIVE_CRON_MARKER);
      if (matchesSchedule(lines[idx + 1] ?? '', nodePath, cliPath)) {
        return ok(undefined); // already installed with this node+CLI path — idempotent
      }
      // Stale path (node or CLI moved after upgrade) — replace the old block.
      return writeCrontab(
        `${removeKeepaliveBlock(current)}\n${KEEPALIVE_CRON_MARKER}\n${scheduleLine(nodePath, cliPath)}\n`
      );
    }
    const next = `${current}\n${KEEPALIVE_CRON_MARKER}\n${scheduleLine(nodePath, cliPath)}\n`;
    return writeCrontab(next);
  }

  uninstall(): Result<void, Error> {
    const current = readCrontab();
    if (!current.includes(KEEPALIVE_CRON_MARKER)) {
      return ok(undefined); // not installed — no-op
    }
    return writeCrontab(removeKeepaliveBlock(current));
  }

  status(): Result<{ installed: boolean; detail: string }, Error> {
    const lines = readCrontab().split('\n');
    const idx = lines.findIndex((l) => l.trim() === KEEPALIVE_CRON_MARKER);
    if (idx === -1) return ok({ installed: false, detail: 'not installed' });
    const schedule = lines[idx + 1]?.trim() ?? '';
    return ok({ installed: true, detail: schedule });
  }
}
