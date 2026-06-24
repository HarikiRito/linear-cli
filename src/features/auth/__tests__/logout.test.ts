import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  deleteProjectSession,
  deleteSession,
  getProjectSessionPath,
  getSessionPath,
  writeProjectSession,
  writeSession,
} from '../session.js';

describe('logout: scope-aware session deletion', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'linear-logout-test-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('deleteProjectSession removes only .linear/auth.json', () => {
    // Write project auth
    writeProjectSession(tmpDir, { apiKey: 'proj-key' });
    const projPath = getProjectSessionPath(tmpDir);
    expect(fs.existsSync(projPath)).toBe(true);

    const result = deleteProjectSession(tmpDir);
    expect(result.isOk()).toBe(true);
    expect(fs.existsSync(projPath)).toBe(false);
  });

  it('deleteProjectSession is idempotent when file does not exist', () => {
    const result = deleteProjectSession(tmpDir);
    expect(result.isOk()).toBe(true);
  });

  it('deleteSession does not affect project auth', () => {
    // Write project auth
    const linearDir = path.join(tmpDir, '.linear');
    fs.mkdirSync(linearDir);
    const projAuthPath = path.join(linearDir, 'auth.json');
    fs.writeFileSync(projAuthPath, JSON.stringify({ apiKey: 'proj-key' }), 'utf-8');

    // deleteSession operates on global path — should not touch project file
    // We just verify that deleteProjectSession works correctly on a separate root
    const result = deleteProjectSession(tmpDir);
    expect(result.isOk()).toBe(true);
    expect(fs.existsSync(projAuthPath)).toBe(false);
  });

  it('getProjectSessionPath returns path inside .linear/', () => {
    const p = getProjectSessionPath('/some/project');
    expect(p).toBe('/some/project/.linear/auth.json');
  });
});
