import fs from 'node:fs';
import type { Command } from 'commander';
import { Result } from 'neverthrow';
import pc from 'picocolors';
import { KEEPALIVE_INTERVAL_MS } from '../../lib/config.js';
import { exitError } from '../../lib/runner.js';
import { isOAuthSession, readProjectSession, readSession } from '../auth/session.js';
import { listProjects } from './registry.js';
import { runKeepaliveCycle } from './rotate.js';
import { getScheduler } from './scheduler/index.js';

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
        'Sessions for all registered projects will be kept alive. Run `linear keepalive status` to view.'
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
    .description('Show scheduler + registered projects.')
    .action(() => {
      const statusResult = getScheduler().status();
      const listResult = listProjects();
      if (statusResult.isErr()) {
        exitError(statusResult.error);
        return;
      }
      if (listResult.isErr()) {
        exitError(listResult.error);
        return;
      }
      const s = statusResult.value;
      console.log(
        s.installed ? pc.green('Scheduler: installed') : pc.yellow('Scheduler: not installed')
      );
      if (s.installed && s.detail) console.log(`  ${s.detail}`);

      const projects = listResult.value;
      if (projects.length === 0) {
        console.log('Registered projects: none');
        return;
      }
      console.log('Registered projects:');
      for (const p of projects) {
        const session = p.scope === 'global' ? readSession() : readProjectSession(p.root);
        const last = session && isOAuthSession(session) ? (session.lastRefreshAt ?? 0) : 0;
        const due = Date.now() - last >= KEEPALIVE_INTERVAL_MS;
        const lastLabel = last ? new Date(last).toISOString() : 'never';
        const scopeLabel = p.scope === 'global' ? '[global]' : '[project]';
        console.log(
          `  ${scopeLabel} ${p.root}  lastRefresh: ${lastLabel}  ${due ? pc.yellow('due') : pc.green('ok')}`
        );
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
