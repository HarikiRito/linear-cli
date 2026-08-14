import fs from 'node:fs';
import path from 'node:path';
import { Result } from 'neverthrow';
import { parse, stringify } from 'smol-toml';
import { toError } from './errors.js';
import { getGlobalConfigDir } from './scope.js';

export interface DefaultTeam {
  id: string;
  key: string;
}

export interface DefaultProject {
  id: string;
  name: string;
}

export interface LinearConfig {
  team?: DefaultTeam;
  workspace?: string;
  projects?: DefaultProject[];
}

export function getGlobalConfigPath(): string {
  return path.join(getGlobalConfigDir(), 'config.toml');
}

/**
 * Read and parse a config.toml, distinguishing "file does not exist" (returns
 * null) from "file exists" (returns the parsed config, possibly `{}` if the
 * file is empty). Callers that need to enforce "config must already exist"
 * should branch on this instead of a separate fs.existsSync pre-check, so the
 * existence check and the actual read can never disagree (TOCTOU).
 */
export function readConfigIfExists(filePath: string): LinearConfig | null {
  const readResult = Result.fromThrowable(
    () => fs.readFileSync(filePath, 'utf-8'),
    (e) => e as NodeJS.ErrnoException
  )();
  if (readResult.isErr()) {
    // File absent (ENOENT) — signal absence; rethrow all other errors
    if (readResult.error.code === 'ENOENT') return null;
    throw readResult.error;
  }
  // File exists — parse errors indicate misconfiguration and should surface
  return parse(readResult.value);
}

export function readConfig(filePath: string): LinearConfig {
  return readConfigIfExists(filePath) ?? {};
}

export function writeConfig(filePath: string, config: LinearConfig): Result<void, Error> {
  return Result.fromThrowable(() => {
    const dir = path.dirname(filePath);
    fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
    // Build a plain object with only defined keys so TOML output is clean
    // and new LinearConfig fields are not silently dropped. Also omits
    // empty arrays (e.g. projects: []) so an intentionally-cleared list
    // doesn't get written as a pointless empty TOML array-of-tables.
    const data = Object.fromEntries(
      Object.entries(config).filter(
        ([, v]) => v !== undefined && !(Array.isArray(v) && v.length === 0)
      )
    );
    fs.writeFileSync(filePath, stringify(data), { encoding: 'utf-8' });
  }, toError)();
}
