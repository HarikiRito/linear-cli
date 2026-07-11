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

  it('round-trips the [team] table and workspace through smol-toml', () => {
    const filePath = path.join(tmpDir, 'config.toml');
    const config = { team: { id: 't1', key: 'ENG' }, workspace: 'acme' };

    const writeResult = writeConfig(filePath, config);
    expect(writeResult.isOk()).toBe(true);

    const readResult = readConfig(filePath);
    expect(readResult).toEqual(config);
    expect(readResult.team).toEqual({ id: 't1', key: 'ENG' });

    // File on disk should be valid TOML text
    const raw = fs.readFileSync(filePath, 'utf-8');
    expect(raw).toContain('[team]');
    expect(raw).toContain('t1');
    expect(raw).toContain('ENG');
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
    const writeResult = writeConfig(filePath, { team: { id: 't1', key: 'ENG' } });
    expect(writeResult.isOk()).toBe(true);
    expect(fs.existsSync(filePath)).toBe(true);
  });

  it('writes only defined keys', () => {
    const filePath = path.join(tmpDir, 'config.toml');
    writeConfig(filePath, { team: { id: 't1', key: 'ENG' } });
    const raw = fs.readFileSync(filePath, 'utf-8');
    expect(raw).toContain('[team]');
    expect(raw).not.toContain('workspace');
  });

  it('round-trips the [[projects]] array-of-tables through smol-toml, preserving order', () => {
    const filePath = path.join(tmpDir, 'config.toml');
    const config = {
      team: { id: 't1', key: 'ENG' },
      projects: [
        { id: 'p1', name: 'Web' },
        { id: 'p2', name: 'API' },
      ],
    };

    const writeResult = writeConfig(filePath, config);
    expect(writeResult.isOk()).toBe(true);

    const readResult = readConfig(filePath);
    expect(readResult).toEqual(config);
    expect(readResult.projects).toEqual([
      { id: 'p1', name: 'Web' },
      { id: 'p2', name: 'API' },
    ]);

    const raw = fs.readFileSync(filePath, 'utf-8');
    expect(raw).toContain('[[projects]]');
  });

  it('omits projects from the written file when unset', () => {
    const filePath = path.join(tmpDir, 'config.toml');
    const writeResult = writeConfig(filePath, { team: { id: 't1', key: 'ENG' } });
    expect(writeResult.isOk()).toBe(true);

    const raw = fs.readFileSync(filePath, 'utf-8');
    expect(raw).not.toContain('projects');

    const readResult = readConfig(filePath);
    expect(readResult.projects).toBeUndefined();
  });

  it('omits projects from the written file when passed as an empty array', () => {
    const filePath = path.join(tmpDir, 'config.toml');
    const writeResult = writeConfig(filePath, { team: { id: 't1', key: 'ENG' }, projects: [] });
    expect(writeResult.isOk()).toBe(true);

    const raw = fs.readFileSync(filePath, 'utf-8');
    expect(raw).not.toContain('projects');

    const readResult = readConfig(filePath);
    expect(readResult.projects).toBeUndefined();
  });

  it('omits both [team] and [[projects]] when neither is set, and read-back has both undefined', () => {
    const filePath = path.join(tmpDir, 'config.toml');
    const writeResult = writeConfig(filePath, { workspace: 'acme' });
    expect(writeResult.isOk()).toBe(true);

    const raw = fs.readFileSync(filePath, 'utf-8');
    expect(raw).not.toContain('[team]');
    expect(raw).not.toContain('[[projects]]');

    const readResult = readConfig(filePath);
    expect(readResult.team).toBeUndefined();
    expect(readResult.projects).toBeUndefined();
  });

  it('reads a legacy config.toml containing only a workspace key without error', () => {
    // Simulates a config.toml written by a pre-redesign version of the CLI,
    // which no longer prompts for/writes `workspace` but must still tolerate
    // reading one written previously.
    const filePath = path.join(tmpDir, 'config.toml');
    fs.writeFileSync(filePath, 'workspace = "acme"\n', 'utf-8');

    const result = readConfig(filePath);
    expect(result).toEqual({ workspace: 'acme' });
    expect(result.workspace).toBe('acme');
  });
});
