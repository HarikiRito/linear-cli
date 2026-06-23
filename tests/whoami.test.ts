import { afterEach, describe, expect, it, vi } from 'vitest';

const mockViewer = { id: 'u1', name: 'Alice', email: 'alice@example.com' };

describe('whoami command', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
    vi.resetModules();
  });

  it('calls printMarkdown when no --json flag', async () => {
    vi.doMock('../src/lib/client/index.js', () => ({
      getClient: vi.fn().mockReturnValue({
        andThen: (fn: (c: unknown) => unknown) =>
          fn({
            viewer: Promise.resolve(mockViewer),
          }),
      }),
    }));

    const markdownCalls: string[] = [];
    vi.doMock('../src/lib/output/markdown.js', () => ({
      markdownTable: vi.fn().mockReturnValue('TABLE'),
      printMarkdown: vi.fn().mockImplementation((s: string) => markdownCalls.push(s)),
    }));

    vi.doMock('../src/lib/output/json.js', () => ({
      printJson: vi.fn(),
    }));

    const { registerWhoami } = await import('../src/features/auth/whoami.js');
    const { Command } = await import('commander');
    const program = new Command();
    program.exitOverride();
    registerWhoami(program);

    await program.parseAsync(['node', 'linear', 'whoami', '--api-key', 'test-key']);

    const { printMarkdown } = await import('../src/lib/output/markdown.js');
    expect(vi.mocked(printMarkdown)).toHaveBeenCalled();
  });

  it('calls printJson when --json flag is used', async () => {
    vi.doMock('../src/lib/client/index.js', () => ({
      getClient: vi.fn().mockReturnValue({
        andThen: (fn: (c: unknown) => unknown) =>
          fn({
            viewer: Promise.resolve(mockViewer),
          }),
      }),
    }));

    vi.doMock('../src/lib/output/markdown.js', () => ({
      markdownTable: vi.fn().mockReturnValue(''),
      printMarkdown: vi.fn(),
    }));

    const jsonOutputs: unknown[] = [];
    vi.doMock('../src/lib/output/json.js', () => ({
      printJson: vi.fn().mockImplementation((d: unknown) => jsonOutputs.push(d)),
    }));

    const { registerWhoami } = await import('../src/features/auth/whoami.js');
    const { Command } = await import('commander');
    const program = new Command();
    program.exitOverride();
    registerWhoami(program);

    await program.parseAsync(['node', 'linear', 'whoami', '--api-key', 'test-key', '--json']);

    expect(jsonOutputs[0]).toMatchObject({ id: 'u1', name: 'Alice', email: 'alice@example.com' });
  });
});
