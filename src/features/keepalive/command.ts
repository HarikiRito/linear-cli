import { execSync } from 'node:child_process';
import fs from 'node:fs';
import type { Command } from 'commander';
import { Result } from 'neverthrow';
import pc from 'picocolors';
import { isPlain } from '../../lib/commandOptions.js';
import { KEEPALIVE_EXPIRY_MARGIN_MS, KEEPALIVE_STATUS_STALE_MS } from '../../lib/config.js';
import { toError } from '../../lib/errors.js';
import { renderPlainRecord } from '../../lib/output/plain.js';
import { exitError } from '../../lib/runner.js';
import { listWorkspaceIds, readWorkspaceCredential } from '../auth/credentials.js';
import { isOAuthSession } from '../auth/session.js';
import { listProjects, unregisterProject } from './registry.js';
import { runKeepaliveCycle } from './rotate.js';
import { readKeepaliveRunStatus } from './run-status.js';
import { getScheduler } from './scheduler/index.js';
import { readWorkspaceState } from './state.js';

/** Realpath of whatever CLI entry point is currently running (falls back to argv[1] as given). */
function resolveCliPath(): string {
  return Result.fromThrowable(
    () => fs.realpathSync(process.argv[1]),
    () => undefined
  )().unwrapOr(process.argv[1]);
}

/**
 * True when `p` is directly runnable via `node <p>` — a `.js`/`.cjs`/`.mjs` file,
 * or a file with a `#!...node` shebang. `which linear` can resolve to a package
 * manager's POSIX-shell/`.cmd` shim (e.g. pnpm's global bin) instead of the real
 * entry point; running `node` on a shim like that fails outright.
 */
function looksLikeNodeEntry(p: string): boolean {
  if (/\.(c|m)?js$/i.test(p)) return true;
  return Result.fromThrowable(() => {
    const fd = fs.openSync(p, 'r');
    try {
      const buf = Buffer.alloc(64);
      const n = fs.readSync(fd, buf, 0, 64, 0);
      return /^#!.*\bnode\b/.test(buf.subarray(0, n).toString('utf-8'));
    } finally {
      fs.closeSync(fd);
    }
  }, toError)().unwrapOr(false);
}

/**
 * Realpath of the `linear` binary resolved from PATH, if any — best-effort,
 * never throws. Returns undefined (not just "no global binary") when the
 * resolved path isn't actually a node-runnable entry point (see looksLikeNodeEntry).
 */
function resolveGlobalCliPath(): string | undefined {
  // `which` doesn't exist on Windows — `where` is the platform equivalent.
  const lookupCmd = process.platform === 'win32' ? 'where linear' : 'which linear';
  const which = Result.fromThrowable(
    () =>
      execSync(lookupCmd, { encoding: 'utf-8', stdio: ['ignore', 'pipe', 'ignore'] })
        .trim()
        .split('\n')[0],
    () => undefined
  )().unwrapOr(undefined);
  if (!which) return undefined;
  const real = Result.fromThrowable(
    () => fs.realpathSync(which),
    () => which
  )().unwrapOr(which);
  return looksLikeNodeEntry(real) ? real : undefined;
}

/**
 * Read-only health check + best-effort self-heal, meant to run once per CLI
 * invocation (see program.ts's preAction hook). If the scheduler is installed
 * but its recorded node/CLI path no longer exists on disk, prints a one-line
 * stderr warning and re-installs using the currently running (by definition
 * valid) paths — reusing CronBackend.install's existing stale-path replace.
 */
export function checkSchedulerHealth(): void {
  // TaskSchedulerBackend can't report node/cli paths (see taskscheduler.ts), so there is
  // nothing to check or heal on Windows — skip the schtasks query on every command.
  if (process.platform === 'win32') return;
  const statusResult = getScheduler().status();
  if (statusResult.isErr() || !statusResult.value.installed) return;
  const { nodePath, cliPath } = statusResult.value;
  const nodeMissing = nodePath !== undefined && !fs.existsSync(nodePath);
  const cliMissing = cliPath !== undefined && !fs.existsSync(cliPath);
  if (!nodeMissing && !cliMissing) return;
  console.error(
    pc.yellow(
      'warning: keepalive scheduler cron entry points at a missing path — run `linear keepalive install` to fix.'
    )
  );
  // Self-heal: prefer the stable global binary (same as `keepalive install`) so healing from
  // a dev checkout or npx cache doesn't re-point cron at a path that disappears later.
  getScheduler().install(process.execPath, resolveGlobalCliPath() ?? resolveCliPath());
}

interface WorkspaceStatusLine {
  id: string;
  credential: 'none' | 'api-key' | 'oauth';
  lastRefresh?: string;
  state: 'backoff' | 'due' | 'ok';
  backoffTier?: number;
  backoffUntil?: string;
  nextDue?: string;
}

async function collectWorkspaceStatus(id: string): Promise<WorkspaceStatusLine> {
  const session = await readWorkspaceCredential(id);
  if (!session) return { id, credential: 'none', state: 'ok' };
  if (!isOAuthSession(session)) return { id, credential: 'api-key', state: 'ok' };

  const last = session.lastRefreshAt ?? 0;
  const state = await readWorkspaceState(id);
  const backingOff =
    state.invalidGrantNextAttemptAt !== undefined && state.invalidGrantNextAttemptAt > Date.now();
  const nextDueAt = session.expiresAt - KEEPALIVE_EXPIRY_MARGIN_MS;
  const due = Date.now() >= nextDueAt;

  return {
    id,
    credential: 'oauth',
    lastRefresh: last ? new Date(last).toISOString() : undefined,
    state: backingOff ? 'backoff' : due ? 'due' : 'ok',
    backoffTier: backingOff ? state.invalidGrantTier : undefined,
    backoffUntil:
      backingOff && state.invalidGrantNextAttemptAt !== undefined
        ? new Date(state.invalidGrantNextAttemptAt).toISOString()
        : undefined,
    nextDue: due ? undefined : new Date(nextDueAt).toISOString(),
  };
}

function printWorkspaceLine(w: WorkspaceStatusLine): void {
  if (w.credential === 'none') {
    console.log(`  ${w.id}  no credential`);
    return;
  }
  if (w.credential === 'api-key') {
    console.log(`  ${w.id}  api-key session (not rotated)`);
    return;
  }
  const lastLabel = w.lastRefresh ?? 'never';
  const stateLabel =
    w.state === 'backoff'
      ? pc.red(`backoff tier ${w.backoffTier ?? '?'} until ${w.backoffUntil}`)
      : w.state === 'due'
        ? pc.yellow('due')
        : pc.green(`ok (next due ${w.nextDue})`);
  console.log(`  ${w.id}  lastRefresh: ${lastLabel}  ${stateLabel}`);
}

export function registerKeepaliveCommands(program: Command): void {
  const keepalive = program
    .command('keepalive')
    .description('Manage automatic refresh-token rotation to keep sessions alive.');

  keepalive
    .command('install')
    .description('Install the global polling scheduler (one-time).')
    .action(() => {
      const running = resolveCliPath();
      const globalPath = resolveGlobalCliPath();
      const cliPath = globalPath ?? running;
      if (!globalPath) {
        console.error(
          pc.yellow(
            'warning: no global `linear` binary found on PATH — installing from the current path. If this checkout moves, the scheduler will break until `linear keepalive install` is run again from a global install.'
          )
        );
      } else if (globalPath !== running) {
        console.error(
          pc.yellow(
            `note: installing the globally-installed binary path (${globalPath}) instead of the current checkout, for a stable cron entry.`
          )
        );
      }

      const result = getScheduler().install(process.execPath, cliPath);
      if (result.isErr()) {
        exitError(result.error);
        return;
      }
      console.log(pc.green('Cron installed.'));
      console.log(
        'Sessions for all authenticated workspaces will be kept alive. Run `linear keepalive status` to view.'
      );
    });

  keepalive
    .command('uninstall')
    .description('Remove the scheduler.')
    .action(() => {
      const result = getScheduler().uninstall();
      if (result.isErr()) {
        exitError(result.error);
        return;
      }
      console.log(pc.green('Scheduler removed.'));
    });

  const statusCmd = keepalive
    .command('status')
    .description('Show scheduler, per-workspace rotation state, and linked directories.')
    .option('--prune', 'remove linked directories whose root no longer exists on disk');

  statusCmd.action(async (opts: { prune?: boolean }) => {
    const plain = isPlain(statusCmd);
    const statusResult = getScheduler().status();
    if (statusResult.isErr()) {
      exitError(statusResult.error);
      return;
    }
    const s = statusResult.value;
    const nodeMissing = s.nodePath !== undefined && !fs.existsSync(s.nodePath);
    const cliMissing = s.cliPath !== undefined && !fs.existsSync(s.cliPath);
    const broken = s.installed && (nodeMissing || cliMissing);
    const runStatus = await readKeepaliveRunStatus();
    const stale =
      s.installed &&
      !broken &&
      (!runStatus ||
        runStatus.result === 'error' ||
        Date.now() - runStatus.lastRunAt > KEEPALIVE_STATUS_STALE_MS);
    const health = broken ? 'BROKEN' : stale ? 'STALE' : 'OK';

    const workspaceIds = await listWorkspaceIds();
    const workspaces = await Promise.all(workspaceIds.map(collectWorkspaceStatus));

    const listResult = listProjects();
    if (listResult.isErr()) {
      exitError(listResult.error);
      return;
    }
    let projects = listResult.value;
    if (opts.prune) {
      for (const p of projects.filter((p) => !fs.existsSync(p.root))) {
        const pruneResult = await unregisterProject(p.root);
        if (pruneResult.isErr()) {
          exitError(pruneResult.error);
          return;
        }
      }
      projects = projects.filter((p) => fs.existsSync(p.root));
    }

    if (plain) {
      console.log(
        renderPlainRecord('Scheduler', s.installed ? 'installed' : 'not-installed', [
          { key: 'health', value: s.installed ? health : undefined },
          { key: 'detail', value: s.detail },
          { key: 'cadence', value: 'poll=15m, rotates when access token has <2h remaining' },
          {
            key: 'lastRun',
            value: runStatus
              ? `${new Date(runStatus.lastRunAt).toISOString()} (${runStatus.result})`
              : 'never',
          },
        ])
      );
      for (const w of workspaces) {
        console.log('---');
        console.log(
          renderPlainRecord('Workspace', w.id, [
            { key: 'credential', value: w.credential },
            { key: 'lastRefresh', value: w.lastRefresh },
            { key: 'state', value: w.state },
            { key: 'nextDue', value: w.nextDue },
          ])
        );
      }
      for (const p of projects) {
        console.log('---');
        console.log(
          renderPlainRecord('LinkedDir', p.root, [
            { key: 'workspace', value: p.workspace },
            { key: 'team', value: p.team?.key },
            { key: 'missing', value: fs.existsSync(p.root) ? undefined : 'true' },
          ])
        );
      }
      return;
    }

    const healthColor = broken ? pc.red : stale ? pc.yellow : pc.green;
    console.log(
      s.installed
        ? `Scheduler: installed (${healthColor(health)})`
        : pc.yellow('Scheduler: not installed')
    );
    if (s.installed && s.detail) console.log(`  ${s.detail}`);
    if (broken) {
      const missing = [nodeMissing && 'node', cliMissing && 'cli'].filter(Boolean).join(', ');
      console.log(
        pc.red(`  missing path(s): ${missing} — run \`linear keepalive install\` to fix`)
      );
    }
    console.log('  cadence: polls every 15m, rotates when the access token has < 2h remaining');
    console.log(
      `  last run: ${runStatus ? `${new Date(runStatus.lastRunAt).toISOString()} (${runStatus.result})` : 'never'}`
    );

    if (workspaces.length === 0) {
      console.log('Workspaces: none');
    } else {
      console.log('Workspaces:');
      for (const w of workspaces) printWorkspaceLine(w);
      console.log('  (ids only — no stored workspace names; link a directory to bind one)');
    }

    if (projects.length === 0) {
      console.log('Linked directories: none');
    } else {
      console.log('Linked directories:');
      for (const p of projects) {
        const missing = !fs.existsSync(p.root);
        const suffix = missing ? pc.yellow('  (MISSING — rerun with --prune to remove)') : '';
        console.log(`  ${p.root}  → ${p.workspace}${p.team ? ` (${p.team.key})` : ''}${suffix}`);
      }
    }
  });

  keepalive
    .command('run')
    .description('Run one rotation cycle (used by scheduler).')
    .option('-q, --quiet', 'suppress output')
    .action(async (opts: { quiet?: boolean }) => {
      const result = await runKeepaliveCycle({ quiet: opts.quiet });
      if (result.isErr()) {
        exitError(result.error);
        return;
      }
      if (!opts.quiet) {
        const s = result.value;
        console.log(
          `keepalive: checked ${s.checked}, rotated ${s.rotated}, skipped ${s.skipped}, failed ${s.failed}, pruned ${s.pruned}`
        );
      }
    });
}
