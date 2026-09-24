import { execSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Command } from 'commander';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Both the cron backend and `which linear` resolution shell out — mock entirely.
vi.mock('node:child_process', () => ({ execSync: vi.fn() }));

import { err } from 'neverthrow';
import * as scopeMod from '../../../lib/scope.js';
import { checkSchedulerHealth, registerKeepaliveCommands } from '../command.js';
import * as registryMod from '../registry.js';
import { linkProject, listProjects } from '../registry.js';
import { writeKeepaliveRunStatus } from '../run-status.js';
import * as schedulerIndexMod from '../scheduler/index.js';

const mockExecSync = vi.mocked(execSync);

let tmpHome: string;
let crontab: string | null; // null → `crontab -l` fails (no crontab)
let written: string[];

function healthyScheduleLine(): string {
  // Use process.execPath for both tokens — a real, always-existing file — so
  // path-existence checks read as "healthy" without depending on argv[0].
  return `*/15 * * * * "${process.execPath}" "${process.execPath}" keepalive run --quiet >> "${path.join(tmpHome, 'keepalive.log')}" 2>&1`;
}

function brokenScheduleLine(): string {
  return `*/15 * * * * "${process.execPath}" "/no/such/path/linear" keepalive run --quiet >> "${path.join(tmpHome, 'keepalive.log')}" 2>&1`;
}

function buildProgram(): Command {
  const program = new Command();
  program.option('--plain', 'Output as plain key:value text').exitOverride();
  registerKeepaliveCommands(program);
  return program;
}

async function run(args: string[]): Promise<{ log: string[]; err: string[] }> {
  const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  await buildProgram().parseAsync(['node', 'linear', ...args]);
  const log = logSpy.mock.calls.map((c) => c.join(' '));
  const err = errSpy.mock.calls.map((c) => c.join(' '));
  logSpy.mockRestore();
  errSpy.mockRestore();
  return { log, err };
}

describe('keepalive command (H-643)', () => {
  beforeEach(() => {
    tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'linear-keepalive-cmd-'));
    vi.spyOn(scopeMod, 'getGlobalConfigDir').mockReturnValue(tmpHome);
    crontab = null;
    written = [];
    mockExecSync.mockImplementation(((command: string, options?: { input?: string }) => {
      if (command === 'crontab -l') {
        if (crontab === null) throw new Error('no crontab for user');
        return crontab;
      }
      if (command === 'crontab -') {
        written.push(options?.input ?? '');
        crontab = options?.input ?? '';
        return '';
      }
      if (command === 'which linear') {
        throw new Error('linear: not found');
      }
      throw new Error(`unexpected command: ${command}`);
    }) as never);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    fs.rmSync(tmpHome, { recursive: true, force: true });
  });

  describe('checkSchedulerHealth (self-heal + warning)', () => {
    it('does nothing when not installed', () => {
      const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      checkSchedulerHealth();
      expect(errSpy).not.toHaveBeenCalled();
      expect(written).toHaveLength(0);
    });

    it('does nothing when installed and both paths exist', () => {
      crontab = `# linear-cli keepalive\n${healthyScheduleLine()}\n`;
      const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      checkSchedulerHealth();
      expect(errSpy).not.toHaveBeenCalled();
      expect(written).toHaveLength(0);
    });

    it('warns to stderr and self-heals when the cron entry points at a missing path', () => {
      crontab = `# linear-cli keepalive\n${brokenScheduleLine()}\n`;
      const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      checkSchedulerHealth();

      expect(errSpy).toHaveBeenCalledWith(expect.stringContaining('missing path'));
      // Self-heal: CronBackend.install rewrote the crontab with a currently-valid path.
      expect(written).toHaveLength(1);
      expect(written[0]).not.toContain('/no/such/path/linear');
    });

    it('skips the scheduler query entirely on win32 (H-643 perf regression)', () => {
      const platformDescriptor = Object.getOwnPropertyDescriptor(process, 'platform');
      Object.defineProperty(process, 'platform', { value: 'win32' });
      const getSchedulerSpy = vi.spyOn(schedulerIndexMod, 'getScheduler');

      checkSchedulerHealth();

      expect(getSchedulerSpy).not.toHaveBeenCalled();
      if (platformDescriptor) Object.defineProperty(process, 'platform', platformDescriptor);
    });
  });

  describe('keepalive install', () => {
    it('prefers the resolved global `linear` binary when it differs from the running path', async () => {
      mockExecSync.mockImplementation(((command: string, options?: { input?: string }) => {
        if (command === 'which linear') return '/opt/homebrew/lib/linear-cli/dist/index.cjs\n';
        if (command === 'crontab -l') throw new Error('no crontab for user');
        if (command === 'crontab -') {
          written.push(options?.input ?? '');
          return '';
        }
        throw new Error(`unexpected command: ${command}`);
      }) as never);

      const { err } = await run(['keepalive', 'install']);

      expect(written).toHaveLength(1);
      expect(written[0]).toContain('/opt/homebrew/lib/linear-cli/dist/index.cjs');
      expect(err.some((l) => l.includes('globally-installed binary path'))).toBe(true);
    });

    it('warns when no global `linear` binary is found on PATH', async () => {
      const { err } = await run(['keepalive', 'install']);

      expect(written).toHaveLength(1);
      expect(err.some((l) => l.includes('no global `linear` binary found on PATH'))).toBe(true);
    });

    it('rejects a `which linear` shim that is not a node-runnable entry (H-643 regression)', async () => {
      // pnpm/npm/volta global bins are often a POSIX-shell (or Windows .cmd) shim, not
      // the JS entry point — `node <shim>` fails outright, so it must never be installed.
      const shimPath = path.join(tmpHome, 'linear');
      fs.writeFileSync(shimPath, '#!/bin/sh\nexec node "$(dirname "$0")/dist/index.cjs" "$@"\n');
      mockExecSync.mockImplementation(((command: string, options?: { input?: string }) => {
        if (command === 'which linear') return `${shimPath}\n`;
        if (command === 'crontab -l') throw new Error('no crontab for user');
        if (command === 'crontab -') {
          written.push(options?.input ?? '');
          return '';
        }
        throw new Error(`unexpected command: ${command}`);
      }) as never);

      const { err } = await run(['keepalive', 'install']);

      expect(written).toHaveLength(1);
      expect(written[0]).not.toContain(shimPath);
      expect(err.some((l) => l.includes('no global `linear` binary found on PATH'))).toBe(true);
    });

    it('accepts a `which linear` shebang script that directly invokes node (no .js extension)', async () => {
      const entryPath = path.join(tmpHome, 'linear-entry');
      fs.writeFileSync(entryPath, '#!/usr/bin/env node\nconsole.log("hi");\n');
      mockExecSync.mockImplementation(((command: string, options?: { input?: string }) => {
        if (command === 'which linear') return `${entryPath}\n`;
        if (command === 'crontab -l') throw new Error('no crontab for user');
        if (command === 'crontab -') {
          written.push(options?.input ?? '');
          return '';
        }
        throw new Error(`unexpected command: ${command}`);
      }) as never);

      const { err } = await run(['keepalive', 'install']);

      expect(written).toHaveLength(1);
      expect(written[0]).toContain(entryPath);
      expect(err.some((l) => l.includes('globally-installed binary path'))).toBe(true);
    });
  });

  describe('keepalive status', () => {
    it('reports BROKEN when the cron entry points at a missing path', async () => {
      crontab = `# linear-cli keepalive\n${brokenScheduleLine()}\n`;

      const { log } = await run(['keepalive', 'status']);

      expect(log.some((l) => l.includes('BROKEN'))).toBe(true);
      expect(log.some((l) => l.includes('missing path(s): cli'))).toBe(true);
    });

    it('reports STALE when no run has ever been recorded', async () => {
      crontab = `# linear-cli keepalive\n${healthyScheduleLine()}\n`;

      const { log } = await run(['keepalive', 'status']);

      expect(log.some((l) => l.includes('STALE'))).toBe(true);
      expect(log.some((l) => l.includes('last run: never'))).toBe(true);
    });

    it('reports OK with cadence + last-run info when the scheduler is healthy and recently ran', async () => {
      crontab = `# linear-cli keepalive\n${healthyScheduleLine()}\n`;
      await writeKeepaliveRunStatus({
        lastRunAt: Date.now(),
        result: 'ok',
        checked: 1,
        rotated: 1,
        failed: 0,
      });

      const { log } = await run(['keepalive', 'status']);

      expect(log.some((l) => l.includes('OK'))).toBe(true);
      expect(log.some((l) => l.includes('cadence: polls every 15m'))).toBe(true);
    });

    it('--plain renders parseable key:value records instead of the pretty output', async () => {
      crontab = `# linear-cli keepalive\n${healthyScheduleLine()}\n`;
      await writeKeepaliveRunStatus({
        lastRunAt: Date.now(),
        result: 'ok',
        checked: 0,
        rotated: 0,
        failed: 0,
      });

      const { log } = await run(['keepalive', 'status', '--plain']);

      expect(log[0]).toContain('Scheduler: installed');
      expect(log[0]).toContain('health: OK');
    });

    it('--prune removes linked directories whose root no longer exists', async () => {
      crontab = null;
      const missingRoot = path.join(tmpHome, 'no-such-project-dir');
      await linkProject(missingRoot, 'ws-1');
      expect(listProjects()._unsafeUnwrap()).toHaveLength(1);

      const { log } = await run(['keepalive', 'status', '--prune']);

      expect(listProjects()._unsafeUnwrap()).toHaveLength(0);
      expect(log.some((l) => l.includes('Linked directories: none'))).toBe(true);
    });

    it('--prune surfaces a registry write failure instead of silently reporting success (H-643 regression)', async () => {
      crontab = null;
      const missingRoot = path.join(tmpHome, 'another-missing-dir');
      await linkProject(missingRoot, 'ws-1');
      const unregisterSpy = vi
        .spyOn(registryMod, 'unregisterProject')
        .mockResolvedValue(err(new Error('EACCES: permission denied')));

      const { err: errLines } = await run(['keepalive', 'status', '--prune']);

      expect(unregisterSpy).toHaveBeenCalledWith(missingRoot);
      expect(errLines.some((l) => l.includes('EACCES'))).toBe(true);
      // Entry must still be there — the write failed, so it must not be reported as pruned.
      expect(listProjects()._unsafeUnwrap()).toHaveLength(1);
    });
  });
});
