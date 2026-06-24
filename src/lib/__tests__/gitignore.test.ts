import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { appendAuthToGitignore } from '../gitignore.js';

describe('gitignore: appendAuthToGitignore', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'linear-gitignore-test-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('appends .linear/auth.json when not already present', () => {
    const gitignorePath = path.join(tmpDir, '.gitignore');
    fs.writeFileSync(gitignorePath, 'node_modules\n.env\n', 'utf-8');

    const result = appendAuthToGitignore(tmpDir);
    expect(result.isOk()).toBe(true);

    const content = fs.readFileSync(gitignorePath, 'utf-8');
    expect(content).toContain('.linear/auth.json');
    expect(content).toContain('node_modules');
    expect(content).toContain('.env');
  });

  it('does not duplicate .linear/auth.json when already present', () => {
    const gitignorePath = path.join(tmpDir, '.gitignore');
    fs.writeFileSync(gitignorePath, 'node_modules\n.linear/auth.json\n', 'utf-8');

    appendAuthToGitignore(tmpDir);
    appendAuthToGitignore(tmpDir);

    const content = fs.readFileSync(gitignorePath, 'utf-8');
    const occurrences = (content.match(/\.linear\/auth\.json/g) ?? []).length;
    expect(occurrences).toBe(1);
  });

  it('creates .gitignore with entry when file does not exist', () => {
    const gitignorePath = path.join(tmpDir, '.gitignore');
    expect(fs.existsSync(gitignorePath)).toBe(false);

    const result = appendAuthToGitignore(tmpDir);
    expect(result.isOk()).toBe(true);

    const content = fs.readFileSync(gitignorePath, 'utf-8');
    expect(content).toContain('.linear/auth.json');
  });

  it('does not add config.toml to gitignore', () => {
    appendAuthToGitignore(tmpDir);
    const content = fs.readFileSync(path.join(tmpDir, '.gitignore'), 'utf-8');
    expect(content).not.toContain('config.toml');
  });
});
