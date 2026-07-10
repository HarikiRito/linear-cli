import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach } from 'vitest';

export interface TmpEnvHandle {
  /** Fresh temp "project" directory for the current test (recreated in beforeEach). */
  readonly projectDir: string;
  /** Fresh temp "home" directory for the current test; process.env.HOME points at it. */
  readonly homeDir: string;
}

export interface TmpEnvOptions {
  /** mkdtemp prefix for the project dir. */
  projectPrefix: string;
  /** mkdtemp prefix for the home dir. */
  homePrefix: string;
  /** Env vars to delete before each test, in addition to the full env snapshot/restore. */
  deleteEnvVars?: string[];
  /** Extra teardown run at the end of afterEach (e.g. resetting process.exitCode). */
  extraTeardown?: () => void;
}

/**
 * Registers beforeEach/afterEach hooks (call once per describe block) that set
 * up — and tear down — a fresh tmp "project" dir + tmp "home" dir + env
 * snapshot/restore + HOME override around every test in the enclosing
 * describe. `process.cwd` is snapshotted/restored too, so individual tests
 * remain free to stub it (e.g. `process.cwd = () => handle.projectDir`).
 *
 * Used by tests that exercise real two-file (project vs global) config/session
 * precedence against actual files on disk rather than mocks.
 */
export function useTmpProjectAndHome(options: TmpEnvOptions): TmpEnvHandle {
  const { projectPrefix, homePrefix, deleteEnvVars = [], extraTeardown } = options;

  let projectDir = '';
  let homeDir = '';
  let originalEnv: NodeJS.ProcessEnv;
  let originalCwd: () => string;
  let originalHome: string | undefined;

  beforeEach(() => {
    projectDir = fs.mkdtempSync(path.join(os.tmpdir(), projectPrefix));
    homeDir = fs.mkdtempSync(path.join(os.tmpdir(), homePrefix));
    originalEnv = { ...process.env };
    originalCwd = process.cwd;
    originalHome = process.env.HOME;
    for (const key of deleteEnvVars) delete process.env[key];
    process.env.HOME = homeDir;
  });

  afterEach(() => {
    fs.rmSync(projectDir, { recursive: true, force: true });
    fs.rmSync(homeDir, { recursive: true, force: true });
    process.cwd = originalCwd;
    if (originalHome !== undefined) {
      process.env.HOME = originalHome;
    } else {
      delete process.env.HOME;
    }
    for (const key of Object.keys(process.env)) {
      if (!(key in originalEnv)) delete process.env[key];
    }
    Object.assign(process.env, originalEnv);
    extraTeardown?.();
  });

  return {
    get projectDir() {
      return projectDir;
    },
    get homeDir() {
      return homeDir;
    },
  };
}
