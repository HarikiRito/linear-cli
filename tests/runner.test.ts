import { CommanderError } from 'commander';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { exitError, handleParseError } from '../src/lib/runner.js';

describe('exitError', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    process.exitCode = undefined;
  });

  it('prints the message once and sets exitCode 1', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    exitError({ message: 'boom' });
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy).toHaveBeenCalledWith('boom');
    expect(process.exitCode).toBe(1);
  });
});

describe('handleParseError', () => {
  let errorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
    process.exitCode = undefined;
  });

  it('does not print again for a missing required option (already printed by commander)', () => {
    const err = new CommanderError(
      1,
      'commander.missingMandatoryOptionValue',
      "error: required option '--team <name-or-key>' not specified"
    );
    handleParseError(err);
    expect(errorSpy).not.toHaveBeenCalled();
    expect(process.exitCode).toBe(1);
  });

  it('does not print again for an unknown command', () => {
    const err = new CommanderError(1, 'commander.unknownCommand', "error: unknown command 'bogus'");
    handleParseError(err);
    expect(errorSpy).not.toHaveBeenCalled();
    expect(process.exitCode).toBe(1);
  });

  it('respects a non-default exitCode on the CommanderError', () => {
    const err = new CommanderError(2, 'commander.invalidArgument', 'error: bad arg');
    handleParseError(err);
    expect(errorSpy).not.toHaveBeenCalled();
    expect(process.exitCode).toBe(2);
  });

  it('exits 0 without printing for help/version display', () => {
    for (const code of ['commander.helpDisplayed', 'commander.help', 'commander.version']) {
      process.exitCode = undefined;
      const err = new CommanderError(0, code, '');
      handleParseError(err);
      expect(process.exitCode).toBeUndefined();
    }
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it('prints "Error: <message>" once for non-commander errors', () => {
    handleParseError(new Error('network down'));
    expect(errorSpy).toHaveBeenCalledTimes(1);
    expect(errorSpy).toHaveBeenCalledWith('Error: network down');
    expect(process.exitCode).toBe(1);
  });

  it('stringifies non-Error thrown values', () => {
    handleParseError('plain string failure');
    expect(errorSpy).toHaveBeenCalledWith('Error: plain string failure');
    expect(process.exitCode).toBe(1);
  });
});
