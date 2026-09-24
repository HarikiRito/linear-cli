import { Command } from 'commander';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../src/features/keepalive/command.js', async () => {
  const actual = await vi.importActual<typeof import('../src/features/keepalive/command.js')>(
    '../src/features/keepalive/command.js'
  );
  return { ...actual, checkSchedulerHealth: vi.fn() };
});

// Isolate the `keepalive status` action from the real scheduler/crontab entirely.
vi.mock('../src/features/keepalive/scheduler/index.js', () => ({
  getScheduler: () => ({
    isInstalled: vi.fn(),
    install: vi.fn(),
    uninstall: vi.fn(),
    status: () => ({ isErr: () => true, error: new Error('mocked — not under test here') }),
  }),
}));

describe('createProgram', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.resetModules();
  });

  it('createProgram returns a Command instance', async () => {
    const { createProgram } = await import('../src/program.js');
    const program = createProgram();
    expect(program).toBeInstanceOf(Command);
  });

  it('createProgram does not call parseAsync', async () => {
    const spy = vi.spyOn(Command.prototype, 'parseAsync');
    const { createProgram } = await import('../src/program.js');
    createProgram();
    expect(spy).not.toHaveBeenCalled();
  });

  it('top-level subcommands include issues and projects', async () => {
    const { createProgram } = await import('../src/program.js');
    const program = createProgram();
    const names = program.commands.map((c) => c.name());
    expect(names).toContain('issues');
    expect(names).toContain('projects');
  });

  it('preAction hook runs the keepalive health check for a non-keepalive command (H-643)', async () => {
    const { checkSchedulerHealth } = await import('../src/features/keepalive/command.js');
    const { createProgram } = await import('../src/program.js');
    const program = createProgram();
    // A throwaway command, decoupled from any other feature's own mocking concerns.
    program.command('dummy-test-cmd').action(() => {});

    await program.parseAsync(['node', 'linear', 'dummy-test-cmd']);

    expect(vi.mocked(checkSchedulerHealth)).toHaveBeenCalledOnce();
  });

  it('preAction hook skips the keepalive health check for `keepalive` subcommands (H-643)', async () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { checkSchedulerHealth } = await import('../src/features/keepalive/command.js');
    const { createProgram } = await import('../src/program.js');
    const program = createProgram();

    await program.parseAsync(['node', 'linear', 'keepalive', 'status']);

    expect(vi.mocked(checkSchedulerHealth)).not.toHaveBeenCalled();
    errSpy.mockRestore();
    process.exitCode = undefined; // the mocked scheduler.status() error path sets it via exitError
  });
});
