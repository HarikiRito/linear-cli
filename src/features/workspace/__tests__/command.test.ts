import { Command } from 'commander';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../select.js', () => ({
  runWorkspaceSelect: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../list.js', () => ({
  runWorkspaceList: vi.fn().mockResolvedValue(undefined),
}));

import { registerWorkspaceCommand } from '../command.js';

describe('registerWorkspaceCommand', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('registers a `workspace` command with `select` and `list` subcommands', () => {
    const program = new Command();
    registerWorkspaceCommand(program);

    const workspace = program.commands.find((c) => c.name() === 'workspace');
    expect(workspace).toBeDefined();
    expect(workspace?.commands.map((c) => c.name())).toContain('select');
    expect(workspace?.commands.map((c) => c.name())).toContain('list');
  });

  it('`workspace select` action runs runWorkspaceSelect', async () => {
    const { runWorkspaceSelect } = await import('../select.js');
    const program = new Command();
    registerWorkspaceCommand(program);
    program.exitOverride();

    await program.parseAsync(['node', 'linear', 'workspace', 'select']);

    expect(vi.mocked(runWorkspaceSelect)).toHaveBeenCalledOnce();
  });

  it('`workspace select` action forwards the non-interactive flags', async () => {
    const { runWorkspaceSelect } = await import('../select.js');
    const program = new Command();
    registerWorkspaceCommand(program);
    program.exitOverride();

    await program.parseAsync([
      'node',
      'linear',
      'workspace',
      'select',
      '--workspace',
      'hariki',
      '--team',
      'H',
      '--projects',
      'AI Code Review',
      '--yes',
    ]);

    expect(vi.mocked(runWorkspaceSelect)).toHaveBeenCalledWith(
      expect.objectContaining({
        workspace: 'hariki',
        team: 'H',
        projects: 'AI Code Review',
        yes: true,
      })
    );
  });

  it('`workspace list` action runs runWorkspaceList', async () => {
    const { runWorkspaceList } = await import('../list.js');
    const program = new Command();
    registerWorkspaceCommand(program);
    program.exitOverride();

    await program.parseAsync(['node', 'linear', 'workspace', 'list']);

    expect(vi.mocked(runWorkspaceList)).toHaveBeenCalledOnce();
  });
});
