import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { findProjectRoot } from '../scope.js';

describe('scope: findProjectRoot', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'linear-scope-test-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('finds .linear/ root when cwd is nested three levels deep', () => {
    // Create root/.linear/ and root/a/b/c
    const linearDir = path.join(tmpDir, '.linear');
    const nested = path.join(tmpDir, 'a', 'b', 'c');
    fs.mkdirSync(linearDir);
    fs.mkdirSync(nested, { recursive: true });

    const result = findProjectRoot(nested);
    expect(result).toBe(tmpDir);
  });

  it('returns null when no .linear/ exists up to root', () => {
    // tmpDir has no .linear/
    const result = findProjectRoot(tmpDir);
    expect(result).toBeNull();
  });

  it('returns the directory itself when .linear/ is in cwd', () => {
    const linearDir = path.join(tmpDir, '.linear');
    fs.mkdirSync(linearDir);

    const result = findProjectRoot(tmpDir);
    expect(result).toBe(tmpDir);
  });

  it('finds root even when cwd is one level deep', () => {
    const linearDir = path.join(tmpDir, '.linear');
    const child = path.join(tmpDir, 'src');
    fs.mkdirSync(linearDir);
    fs.mkdirSync(child);

    const result = findProjectRoot(child);
    expect(result).toBe(tmpDir);
  });
});
