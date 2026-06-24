import fs from 'node:fs';
import path from 'node:path';
import { err, ok, type Result } from 'neverthrow';
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
  let content: string;
  try {
    content = fs.readFileSync(filePath, 'utf-8');
  } catch (e) {
    // File absent (ENOENT) or inaccessible — treat as empty config
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') {
      return {};
    }
    throw e;
  }
  // File exists — parse errors indicate misconfiguration and should surface
  return parse(content) as LinearConfig;
}

export function writeConfig(filePath: string, config: LinearConfig): Result<void, Error> {
  try {
    const dir = path.dirname(filePath);
    fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
    // Build a plain object with only defined keys so TOML output is clean
    // and new LinearConfig fields are not silently dropped
    const data = Object.fromEntries(
      Object.entries(config).filter(([, v]) => v !== undefined)
    ) as Record<string, string>;
    fs.writeFileSync(filePath, stringify(data), { encoding: 'utf-8' });
    return ok(undefined);
  } catch (e) {
    return err(e instanceof Error ? e : new Error(String(e)));
  }
}
