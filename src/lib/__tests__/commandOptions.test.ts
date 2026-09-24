import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Command, Option } from 'commander';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { isPlain } from '../commandOptions.js';
import { getGlobalConfigPath, writeConfig } from '../config-file.js';

function buildProgram(): Command {
  return new Command()
    .addOption(new Option('--plain').conflicts('table'))
    .addOption(new Option('--table').conflicts('plain'))
    .exitOverride();
}

/** Registers a no-op subcommand, parses `args` against it, and returns isPlain(cmd) as captured by its action. */
async function runAndCapture(program: Command, args: string[]): Promise<boolean> {
  let captured: boolean | undefined;
  const probe = program.command('probe');
  probe.action(() => {
    captured = isPlain(probe);
  });
  await program.parseAsync(['node', 'linear', ...args]);
  if (captured === undefined) throw new Error('probe action did not run');
  return captured;
}

describe('isPlain: global output-mode precedence (flag > LINEAR_OUTPUT env > config > table default)', () => {
  let homeDir: string;
  let originalHome: string | undefined;
  let originalEnv: string | undefined;

  beforeEach(() => {
    homeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'linear-cmdopts-home-'));
    originalHome = process.env.HOME;
    originalEnv = process.env.LINEAR_OUTPUT;
    // stub os.homedir() directly so isolation holds on Windows too (os.homedir() reads USERPROFILE there, not HOME)
    vi.spyOn(os, 'homedir').mockReturnValue(homeDir);
    process.env.HOME = homeDir;
    delete process.env.LINEAR_OUTPUT;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    fs.rmSync(homeDir, { recursive: true, force: true });
    if (originalHome !== undefined) process.env.HOME = originalHome;
    else delete process.env.HOME;
    if (originalEnv !== undefined) process.env.LINEAR_OUTPUT = originalEnv;
    else delete process.env.LINEAR_OUTPUT;
  });

  it('defaults to table output with no flag, env, or config', async () => {
    await expect(runAndCapture(buildProgram(), ['probe'])).resolves.toBe(false);
  });

  it('config output.default = "plain" makes isPlain true with no flag/env', async () => {
    writeConfig(getGlobalConfigPath(), { output: { default: 'plain' } });
    await expect(runAndCapture(buildProgram(), ['probe'])).resolves.toBe(true);
  });

  it('LINEAR_OUTPUT=plain makes isPlain true with no flag, overriding config', async () => {
    writeConfig(getGlobalConfigPath(), { output: { default: 'table' } });
    process.env.LINEAR_OUTPUT = 'plain';
    await expect(runAndCapture(buildProgram(), ['probe'])).resolves.toBe(true);
  });

  it('--plain flag wins over env and config', async () => {
    process.env.LINEAR_OUTPUT = 'table';
    writeConfig(getGlobalConfigPath(), { output: { default: 'table' } });
    await expect(runAndCapture(buildProgram(), ['probe', '--plain'])).resolves.toBe(true);
  });

  it('--table flag forces table even when env/config default to plain', async () => {
    process.env.LINEAR_OUTPUT = 'plain';
    writeConfig(getGlobalConfigPath(), { output: { default: 'plain' } });
    await expect(runAndCapture(buildProgram(), ['probe', '--table'])).resolves.toBe(false);
  });

  it('rejects passing both --plain and --table', async () => {
    await expect(runAndCapture(buildProgram(), ['probe', '--plain', '--table'])).rejects.toThrow();
  });

  it('throws a clear error listing valid values for an invalid LINEAR_OUTPUT value', async () => {
    process.env.LINEAR_OUTPUT = 'json';
    await expect(runAndCapture(buildProgram(), ['probe'])).rejects.toThrow(
      "Invalid output mode 'json' from LINEAR_OUTPUT env var. Valid values: plain, table"
    );
  });

  it('throws a clear error listing valid values for an invalid config value', async () => {
    writeConfig(getGlobalConfigPath(), { output: { default: 'yaml' } });
    await expect(runAndCapture(buildProgram(), ['probe'])).rejects.toThrow(
      "Invalid output mode 'yaml' from output.default config key. Valid values: plain, table"
    );
  });
});
