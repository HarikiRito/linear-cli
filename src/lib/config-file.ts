import fs from 'node:fs';
import path from 'node:path';
import { Result } from 'neverthrow';
import { toError } from './errors.js';
import { parse, stringify } from 'smol-toml';
import { getGlobalConfigDir, getProjectLinearDir } from './scope.js';

export interface LinearConfig {
  team_id?: string;
  workspace?: string;
}

export function getGlobalConfigPath(): string {
  return path.join(getGlobalConfigDir(), 'config.toml');
}

export function getProjectConfigPath(projectRoot: string): string {
  return path.join(getProjectLinearDir(projectRoot), 'config.toml');
}

export function readConfig(filePath: string): LinearConfig {
  const readResult = Result.fromThrowable(
    () => fs.readFileSync(filePath, 'utf-8'),
    (e) => e as NodeJS.ErrnoException
  )();
  if (readResult.isErr()) {
    // File absent (ENOENT) — treat as empty config; rethrow all other errors
    if (readResult.error.code === 'ENOENT') return {};
    throw readResult.error;
  }
  // File exists — parse errors indicate misconfiguration and should surface
  return parse(readResult.value) as LinearConfig;
}

export function writeConfig(filePath: string, config: LinearConfig): Result<void, Error> {
  return Result.fromThrowable(
    () => {
      const dir = path.dirname(filePath);
      fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
      // Build a plain object with only defined keys so TOML output is clean
      // and new LinearConfig fields are not silently dropped
      const data = Object.fromEntries(
        Object.entries(config).filter(([, v]) => v !== undefined)
      ) as Record<string, string>;
      fs.writeFileSync(filePath, stringify(data), { encoding: 'utf-8' });
    },
    toError
  )();
}
