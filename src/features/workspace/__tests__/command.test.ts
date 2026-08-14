import { Command } from 'commander';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../select.js', () => ({
  runWorkspaceSelect: vi.fn().mockResolvedValue(undefined),
}));

import { registerWorkspaceCommand } from '../command.js';

describe('registerWorkspaceCommand', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('registers a `workspace` command with a `select` subcommand', () => {
    const program = new Command();
    registerWorkspaceCommand(program);

    const workspace = program.commands.find((c) => c.name() === 'workspace');
    expect(workspace).toBeDefined();
    expect(workspace?.commands.map((c) => c.name())).toContain('select');
  });

  it('`workspace select` action runs runWorkspaceSelect', async () => {
    const { runWorkspaceSelect } = await import('../select.js');
    const program = new Command();
    registerWorkspaceCommand(program);
    program.exitOverride();

    await program.parseAsync(['node', 'linear', 'workspace', 'select']);

    expect(vi.mocked(runWorkspaceSelect)).toHaveBeenCalledOnce();
  });
});
