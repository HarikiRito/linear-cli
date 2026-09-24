import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { Result, ResultAsync } from 'neverthrow';
import { getKeepaliveRunStatusPath } from '../../lib/config.js';

export type KeepaliveRunResult = 'ok' | 'error';

/** Small marker file written on every `keepalive run` — lets `status` detect a broken/silent scheduler. */
export interface KeepaliveRunStatus {
  lastRunAt: number;
  result: KeepaliveRunResult;
  checked: number;
  rotated: number;
  failed: number;
}

function isKeepaliveRunStatus(value: unknown): value is KeepaliveRunStatus {
  if (typeof value !== 'object' || value === null) return false;
  const c = value as Partial<KeepaliveRunStatus>;
  return typeof c.lastRunAt === 'number' && (c.result === 'ok' || c.result === 'error');
}

/** Tolerate missing or malformed status file; never throws. Returns null when no run has ever recorded. */
export async function readKeepaliveRunStatus(): Promise<KeepaliveRunStatus | null> {
  const content = await ResultAsync.fromPromise(
    readFile(getKeepaliveRunStatusPath(), 'utf-8'),
    () => undefined
  ).unwrapOr('');
  const parsed = Result.fromThrowable(
    () => JSON.parse(content) as unknown,
    () => undefined
  )().unwrapOr(null);
  return parsed !== null && isKeepaliveRunStatus(parsed) ? parsed : null;
}

/** Best-effort write — a status-file failure must never break the rotation cycle itself. */
export async function writeKeepaliveRunStatus(status: KeepaliveRunStatus): Promise<void> {
  const p = getKeepaliveRunStatusPath();
  await ResultAsync.fromPromise(
    (async () => {
      await mkdir(path.dirname(p), { recursive: true, mode: 0o700 });
      await writeFile(p, `${JSON.stringify(status, null, 2)}\n`, {
        encoding: 'utf-8',
        mode: 0o600,
      });
    })(),
    () => undefined
  ).unwrapOr(undefined);
}
