import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { readConfig, writeConfig } from '../config-file.js';

describe('config-file', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'linear-config-test-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('round-trips team_id and workspace through smol-toml', () => {
    const filePath = path.join(tmpDir, 'config.toml');
    const config = { team_id: 'TEAM_01', workspace: 'acme' };

    const writeResult = writeConfig(filePath, config);
    expect(writeResult.isOk()).toBe(true);

    const readResult = readConfig(filePath);
    expect(readResult).toEqual(config);

    // File on disk should be valid TOML text
    const raw = fs.readFileSync(filePath, 'utf-8');
    expect(raw).toContain('team_id');
    expect(raw).toContain('TEAM_01');
    expect(raw).toContain('workspace');
    expect(raw).toContain('acme');
  });

  it('returns empty object when config.toml does not exist', () => {
    const filePath = path.join(tmpDir, 'nonexistent.toml');
    const result = readConfig(filePath);
    expect(result).toEqual({});
  });

  it('creates parent directories when writing', () => {
    const filePath = path.join(tmpDir, 'nested', 'dir', 'config.toml');
    const writeResult = writeConfig(filePath, { team_id: 'T1' });
    expect(writeResult.isOk()).toBe(true);
    expect(fs.existsSync(filePath)).toBe(true);
  });

  it('writes only defined keys', () => {
    const filePath = path.join(tmpDir, 'config.toml');
    writeConfig(filePath, { team_id: 'T1' });
    const raw = fs.readFileSync(filePath, 'utf-8');
    expect(raw).toContain('team_id');
    expect(raw).not.toContain('workspace');
  });
});
