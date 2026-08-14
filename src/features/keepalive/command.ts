import fs from 'node:fs';
import type { Command } from 'commander';
import { Result } from 'neverthrow';
import pc from 'picocolors';
import { KEEPALIVE_INTERVAL_MS } from '../../lib/config.js';
import { exitError } from '../../lib/runner.js';
import { listWorkspaceIds, readWorkspaceCredential } from '../auth/credentials.js';
import { isOAuthSession } from '../auth/session.js';
import { listProjects } from './registry.js';
import { runKeepaliveCycle } from './rotate.js';
import { getScheduler } from './scheduler/index.js';
import { readWorkspaceState } from './state.js';

function resolveCliPath(): string {
  return Result.fromThrowable(
    () => fs.realpathSync(process.argv[1]),
    () => undefined
  )().unwrapOr(process.argv[1]);
}

export function registerKeepaliveCommands(program: Command): void {
  const keepalive = program
    .command('keepalive')
    .description('Manage automatic refresh-token rotation to keep sessions alive.');

  keepalive
    .command('install')
    .description('Install the global polling scheduler (one-time).')
    .action(() => {
      const result = getScheduler().install(process.execPath, resolveCliPath());
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

  keepalive
    .command('status')
    .description('Show scheduler, per-workspace rotation state, and linked directories.')
    .action(async () => {
      const statusResult = getScheduler().status();
      if (statusResult.isErr()) {
        exitError(statusResult.error);
        return;
      }
      const s = statusResult.value;
      console.log(
        s.installed ? pc.green('Scheduler: installed') : pc.yellow('Scheduler: not installed')
      );
      if (s.installed && s.detail) console.log(`  ${s.detail}`);

      // Per-workspace rotation state — offline-safe: ids only, no network calls.
      const workspaceIds = await listWorkspaceIds();
      if (workspaceIds.length === 0) {
        console.log('Workspaces: none');
      } else {
        console.log('Workspaces:');
        for (const id of workspaceIds) {
          const session = await readWorkspaceCredential(id);
          if (!session) {
            console.log(`  ${id}  no credential`);
            continue;
          }
          if (!isOAuthSession(session)) {
            console.log(`  ${id}  api-key session (not rotated)`);
            continue;
          }
          const last = session.lastRefreshAt ?? 0;
          const lastLabel = last ? new Date(last).toISOString() : 'never';
          const state = await readWorkspaceState(id);
          const backingOff =
            state.invalidGrantNextAttemptAt !== undefined &&
            state.invalidGrantNextAttemptAt > Date.now();
          const due = Date.now() - last >= KEEPALIVE_INTERVAL_MS;
          const stateLabel = backingOff
            ? pc.red(
                `backoff tier ${state.invalidGrantTier ?? '?'} until ${new Date(
                  state.invalidGrantNextAttemptAt as number
                ).toISOString()}`
              )
            : due
              ? pc.yellow('due')
              : pc.green('ok');
          console.log(`  ${id}  lastRefresh: ${lastLabel}  ${stateLabel}`);
        }
        console.log('  (ids only — no stored workspace names; link a directory to bind one)');
      }

      // Linked directories (registry).
      const listResult = listProjects();
      if (listResult.isErr()) {
        exitError(listResult.error);
        return;
      }
      const projects = listResult.value;
      if (projects.length === 0) {
        console.log('Linked directories: none');
      } else {
        console.log('Linked directories:');
        for (const p of projects) {
          console.log(`  ${p.root}  → ${p.workspace}${p.team ? ` (${p.team.key})` : ''}`);
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
