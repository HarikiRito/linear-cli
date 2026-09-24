import { describe, expect, it } from 'vitest';
import { parseOutputMode, resolveOutputMode } from '../output-mode.js';

describe('parseOutputMode', () => {
  it('accepts "plain" and "table", case-insensitively and trimmed', () => {
    expect(parseOutputMode('plain', 'test').unwrapOr(undefined)).toBe('plain');
    expect(parseOutputMode(' TABLE ', 'test').unwrapOr(undefined)).toBe('table');
  });

  it('returns a ValidationError naming the source and valid values for an invalid value', () => {
    const result = parseOutputMode('json', 'LINEAR_OUTPUT env var');
    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr().message).toBe(
      "Invalid output mode 'json' from LINEAR_OUTPUT env var. Valid values: plain, table"
    );
  });

  it('returns a ValidationError instead of throwing for a non-string raw value (e.g. TOML `output.default = true`)', () => {
    // config.toml is parsed untyped, so a boolean/number can reach here despite the string type
    const result = parseOutputMode(true as unknown as string, 'output.default config key');
    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr().message).toBe(
      "Invalid output mode 'true' from output.default config key. Valid values: plain, table"
    );
  });
});

describe('resolveOutputMode precedence: flag > env > config > default', () => {
  it('defaults to table with no sources', () => {
    expect(resolveOutputMode({}).unwrapOr(undefined)).toBe('table');
  });

  it('config alone selects its value', () => {
    expect(resolveOutputMode({ config: 'plain' }).unwrapOr(undefined)).toBe('plain');
  });

  it('env overrides config', () => {
    expect(resolveOutputMode({ env: 'table', config: 'plain' }).unwrapOr(undefined)).toBe('table');
  });

  it('plainFlag overrides env and config', () => {
    expect(
      resolveOutputMode({ plainFlag: true, env: 'table', config: 'table' }).unwrapOr(undefined)
    ).toBe('plain');
  });

  it('tableFlag overrides env and config', () => {
    expect(
      resolveOutputMode({ tableFlag: true, env: 'plain', config: 'plain' }).unwrapOr(undefined)
    ).toBe('table');
  });

  it('plainFlag wins even when tableFlag is also set (flag-order tiebreak)', () => {
    expect(resolveOutputMode({ plainFlag: true, tableFlag: true }).unwrapOr(undefined)).toBe(
      'plain'
    );
  });

  it('propagates a ValidationError for an invalid env value', () => {
    const result = resolveOutputMode({ env: 'yaml' });
    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr().message).toContain("Invalid output mode 'yaml'");
  });

  it('propagates a ValidationError for an invalid config value', () => {
    const result = resolveOutputMode({ config: 'json' });
    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr().message).toContain("Invalid output mode 'json'");
  });
});
