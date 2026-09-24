import { err, ok, type Result } from 'neverthrow';
import { ValidationError } from './errors.js';

export const OUTPUT_MODES = ['plain', 'table'] as const;
export type OutputMode = (typeof OUTPUT_MODES)[number];

function isOutputMode(value: string): value is OutputMode {
  return (OUTPUT_MODES as readonly string[]).includes(value);
}

/** Validate a raw output-mode string; `source` names the origin in the error message. */
export function parseOutputMode(raw: string, source: string): Result<OutputMode, ValidationError> {
  const value = raw.trim().toLowerCase();
  if (!isOutputMode(value)) {
    return err(
      new ValidationError(
        `Invalid output mode '${raw}' from ${source}. Valid values: ${OUTPUT_MODES.join(', ')}`
      )
    );
  }
  return ok(value);
}

export interface OutputModeSources {
  /** --plain flag, read from optsWithGlobals() */
  plainFlag?: boolean | undefined;
  /** --table flag, read from optsWithGlobals() */
  tableFlag?: boolean | undefined;
  /** raw LINEAR_OUTPUT env value, if set */
  env?: string | undefined;
  /** raw config `[output] default` value, if set */
  config?: string | undefined;
}

/**
 * Resolve the effective output mode. Precedence: explicit flag > LINEAR_OUTPUT
 * env > config `output.default` > built-in default ('table').
 */
export function resolveOutputMode(sources: OutputModeSources): Result<OutputMode, ValidationError> {
  if (sources.plainFlag) return ok('plain');
  if (sources.tableFlag) return ok('table');
  if (sources.env) return parseOutputMode(sources.env, 'LINEAR_OUTPUT env var');
  if (sources.config) return parseOutputMode(sources.config, 'output.default config key');
  return ok('table');
}
