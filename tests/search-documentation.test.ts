import { afterEach, describe, expect, it, vi } from 'vitest';

async function buildProgram() {
  const { registerSearchDocumentation } = await import(
    '../src/features/search-documentation/command.js'
  );
  const { Command } = await import('commander');
  const program = new Command();
  program.exitOverride();
  registerSearchDocumentation(program);
  return program;
}

describe('search-documentation', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
    vi.resetModules();
    process.exitCode = undefined;
  });

  it('exits non-zero with unsupported message (non-json)', async () => {
    const exitError = vi.fn();
    vi.doMock('../src/lib/runner.js', () => ({ exitError }));
    vi.doMock('../src/lib/errors.js', () => {
      class ValidationError extends Error {
        readonly kind = 'ValidationError' as const;
        constructor(message: string) {
          super(message);
          this.name = 'ValidationError';
        }
      }
      return { ValidationError };
    });

    const program = await buildProgram();
    await program.parseAsync(['node', 'linear', 'search-documentation', 'how to create project']);

    expect(exitError).toHaveBeenCalledOnce();
    const arg = exitError.mock.calls[0][0] as Error;
    expect(arg.message).toMatch(/not supported/i);
    expect(arg.message).toContain('search-documentation is not supported');
  });

  it('--json outputs valid JSON error and sets exitCode 1', async () => {
    const printJsonCalls: unknown[] = [];
    vi.doMock('../src/lib/output/json.js', () => ({
      printJson: vi.fn().mockImplementation((d: unknown) => printJsonCalls.push(d)),
    }));
    vi.doMock('../src/lib/runner.js', () => ({ exitError: vi.fn() }));
    vi.doMock('../src/lib/errors.js', () => {
      class ValidationError extends Error {
        readonly kind = 'ValidationError' as const;
        constructor(message: string) {
          super(message);
          this.name = 'ValidationError';
        }
      }
      return { ValidationError };
    });

    const program = await buildProgram();
    await program.parseAsync(['node', 'linear', 'search-documentation', 'query text', '--json']);

    expect(printJsonCalls.length).toBe(1);
    const out = printJsonCalls[0] as { error: string };
    expect(out).toHaveProperty('error');
    expect(out.error).toMatch(/not supported/i);
    expect(out.error).toContain('search-documentation is not supported');
    expect(process.exitCode).toBe(1);
  });
});
