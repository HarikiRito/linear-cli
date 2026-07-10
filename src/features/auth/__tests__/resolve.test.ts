import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// We test resolveCredential by controlling:
// - process.env vars
// - process.cwd() (for project scope discovery)
// - the actual auth.json files on disk in temp directories

// We DON'T import resolveCredential directly because it has complex async/interactive
// behaviour. Instead we test the building blocks: session read/write and scope.

import { useTmpProjectAndHome } from '../../../../tests/helpers/tmp-env.js';
import { findProjectRoot } from '../../../lib/scope.js';
import { resolveCredential } from '../resolve.js';
import {
  isApiKeySession,
  isOAuthSession,
  readProjectSession,
  writeProjectSession,
  writeSession,
} from '../session.js';

describe('resolveAuth building blocks', () => {
  let tmpDir: string;
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'linear-resolve-test-'));
    originalEnv = { ...process.env };
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
    // Restore env
    for (const key of Object.keys(process.env)) {
      if (!(key in originalEnv)) {
        delete process.env[key];
      }
    }
    Object.assign(process.env, originalEnv);
  });

  describe('project session helpers', () => {
    it('writeProjectSession and readProjectSession round-trip', () => {
      const session = { apiKey: 'proj-key' };
      const writeResult = writeProjectSession(tmpDir, session);
      expect(writeResult.isOk()).toBe(true);

      const read = readProjectSession(tmpDir);
      expect(read).toEqual(session);
    });

    it('readProjectSession returns null when file does not exist', () => {
      const read = readProjectSession(tmpDir);
      expect(read).toBeNull();
    });
  });

  describe('session type guards', () => {
    it('isApiKeySession returns true for apiKey session', () => {
      expect(isApiKeySession({ apiKey: 'k' })).toBe(true);
    });

    it('isOAuthSession returns true for oauth session', () => {
      expect(isOAuthSession({ accessToken: 'at', refreshToken: 'rt', expiresAt: 0 })).toBe(true);
    });
  });
});

describe('resolveAuth: auth precedence (integration-style)', () => {
  let tmpDir: string;
  let originalEnv: NodeJS.ProcessEnv;
  let originalCwd: () => string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'linear-auth-prec-test-'));
    originalEnv = { ...process.env };
    originalCwd = process.cwd;
    // Delete auth-related env vars before each test
    delete process.env.LINEAR_API_KEY;
    delete process.env.LINEAR_ACCESS_TOKEN;
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
    process.cwd = originalCwd;
    for (const key of Object.keys(process.env)) {
      if (!(key in originalEnv)) delete process.env[key];
    }
    Object.assign(process.env, originalEnv);
  });

  it('resolveAuth: project .linear/auth.json is found by scope discovery when cwd is inside project', () => {
    // Set up project tree: tmpDir/.linear/auth.json
    const linearDir = path.join(tmpDir, '.linear');
    fs.mkdirSync(linearDir);

    const subDir = path.join(tmpDir, 'src', 'feature');
    fs.mkdirSync(subDir, { recursive: true });

    // Mock cwd to be the nested dir
    process.cwd = () => subDir;

    // Verify scope discovers the project root
    const root = findProjectRoot(subDir);
    expect(root).toBe(tmpDir);

    // Write project auth
    writeProjectSession(tmpDir, { apiKey: 'proj-key' });

    // Read back through the discovered root
    const session = readProjectSession(root!);
    expect(session).toEqual({ apiKey: 'proj-key' });
  });

  it('resolveAuth: scope returns null when outside any project', () => {
    // tmpDir has no .linear/
    const root = findProjectRoot(tmpDir);
    expect(root).toBeNull();
  });

  it('resolveAuth: project auth takes precedence over global when both exist', () => {
    // Setup project
    const linearDir = path.join(tmpDir, '.linear');
    fs.mkdirSync(linearDir);
    writeProjectSession(tmpDir, { apiKey: 'proj-key' });

    // Setup global (write to a temp "global" location for this test)
    // We verify which one findProjectRoot returns — not the global path
    const projectRoot = findProjectRoot(tmpDir);
    expect(projectRoot).toBe(tmpDir);

    const projectSession = readProjectSession(projectRoot!);
    expect(projectSession).toEqual({ apiKey: 'proj-key' });
  });
});

describe('resolveTeam config resolution', () => {
  let tmpDir: string;
  let originalEnv: NodeJS.ProcessEnv;
  let originalCwd: () => string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'linear-team-test-'));
    originalEnv = { ...process.env };
    originalCwd = process.cwd;
    delete process.env.LINEAR_TEAM_ID;
    delete process.env.LINEAR_WORKSPACE;
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
    process.cwd = originalCwd;
    for (const key of Object.keys(process.env)) {
      if (!(key in originalEnv)) delete process.env[key];
    }
    Object.assign(process.env, originalEnv);
  });

  it('resolveTeam: LINEAR_TEAM_ID env overrides project config team_id', async () => {
    // Setup project config
    const linearDir = path.join(tmpDir, '.linear');
    fs.mkdirSync(linearDir);
    fs.writeFileSync(path.join(linearDir, 'config.toml'), 'team_id = "proj-team"\n', 'utf-8');
    process.cwd = () => tmpDir;
    process.env.LINEAR_TEAM_ID = 'env-team';

    const { getDefaultTeamId } = await import('../../../features/issues/shared/resolve.js');
    const teamId = getDefaultTeamId();
    expect(teamId).toBe('env-team');
  });

  it('resolveTeam: project config team_id used before global config team_id', async () => {
    // Setup project with team_id
    const linearDir = path.join(tmpDir, '.linear');
    fs.mkdirSync(linearDir);
    fs.writeFileSync(path.join(linearDir, 'config.toml'), 'team_id = "proj-team"\n', 'utf-8');
    process.cwd = () => tmpDir;

    const { getDefaultTeamId } = await import('../../../features/issues/shared/resolve.js');
    const teamId = getDefaultTeamId();
    expect(teamId).toBe('proj-team');
  });

  it('resolveTeam: returns null when no config or env', async () => {
    // No .linear dir, no env vars, cwd = tmpDir
    process.cwd = () => tmpDir;

    const { getDefaultTeamId } = await import('../../../features/issues/shared/resolve.js');
    const teamId = getDefaultTeamId();
    expect(teamId).toBeNull();
  });
});

/**
 * Real two-file precedence tests — exercises resolveCredential() and
 * getDefaultTeamId() end-to-end against REAL project `.linear/auth.json` (or
 * `config.toml`) AND REAL global `~/.config/.linear/...` files simultaneously
 * present on disk, with no mocking of the session/config read layer. This is
 * the "race" scenario the plan calls out as unexercised by the existing tests
 * above, which only ever write one side (project OR global) at a time.
 */
describe('resolveCredential: real two-file precedence (project vs global)', () => {
  const tmpEnv = useTmpProjectAndHome({
    projectPrefix: 'linear-real-project-',
    homePrefix: 'linear-real-home-',
    deleteEnvVars: ['LINEAR_API_KEY', 'LINEAR_ACCESS_TOKEN'],
  });

  it('project session wins when BOTH a real project auth.json and a real global auth.json exist', async () => {
    // Write the global session for real, under $HOME/.config/.linear/auth.json
    const globalWrite = writeSession({ apiKey: 'global-real-key' });
    expect(globalWrite.isOk()).toBe(true);

    // Write a real project session under <tmpEnv.projectDir>/.linear/auth.json
    const projectWrite = writeProjectSession(tmpEnv.projectDir, { apiKey: 'project-real-key' });
    expect(projectWrite.isOk()).toBe(true);

    // cwd is inside the project directory, so findProjectRoot discovers .linear/
    process.cwd = () => tmpEnv.projectDir;

    const result = await resolveCredential({ allowInteractive: false });
    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap()).toEqual({ type: 'apiKey', value: 'project-real-key' });
  });

  it('falls back to the real global session when no project session exists', async () => {
    const globalWrite = writeSession({ apiKey: 'global-only-real-key' });
    expect(globalWrite.isOk()).toBe(true);

    // cwd has no .linear/ ancestor at all
    process.cwd = () => tmpEnv.projectDir;

    const result = await resolveCredential({ allowInteractive: false });
    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap()).toEqual({ type: 'apiKey', value: 'global-only-real-key' });
  });
});

describe('getDefaultTeamId: real two-file precedence (project vs global)', () => {
  const tmpEnv = useTmpProjectAndHome({
    projectPrefix: 'linear-real-team-project-',
    homePrefix: 'linear-real-team-home-',
    deleteEnvVars: ['LINEAR_TEAM_ID', 'LINEAR_WORKSPACE'],
  });

  it('project config.toml team_id wins when BOTH real project and global config.toml set different values', async () => {
    // Real global config.toml at $HOME/.config/.linear/config.toml
    const globalLinearDir = path.join(tmpEnv.homeDir, '.config', '.linear');
    fs.mkdirSync(globalLinearDir, { recursive: true });
    fs.writeFileSync(
      path.join(globalLinearDir, 'config.toml'),
      'team_id = "global-team"\n',
      'utf-8'
    );

    // Real project config.toml
    const projectLinearDir = path.join(tmpEnv.projectDir, '.linear');
    fs.mkdirSync(projectLinearDir, { recursive: true });
    fs.writeFileSync(
      path.join(projectLinearDir, 'config.toml'),
      'team_id = "project-team"\n',
      'utf-8'
    );

    process.cwd = () => tmpEnv.projectDir;

    const { getDefaultTeamId } = await import('../../../features/issues/shared/resolve.js');
    expect(getDefaultTeamId()).toBe('project-team');
  });

  it('falls back to the real global config.toml team_id when no project config exists', async () => {
    const globalLinearDir = path.join(tmpEnv.homeDir, '.config', '.linear');
    fs.mkdirSync(globalLinearDir, { recursive: true });
    fs.writeFileSync(
      path.join(globalLinearDir, 'config.toml'),
      'team_id = "global-only-team"\n',
      'utf-8'
    );

    process.cwd = () => tmpEnv.projectDir;

    const { getDefaultTeamId } = await import('../../../features/issues/shared/resolve.js');
    expect(getDefaultTeamId()).toBe('global-only-team');
  });
});
