import { Command } from 'commander';
import { afterEach, describe, expect, it, vi } from 'vitest';

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

  it('renderSkill against real program contains known commands', async () => {
    const { createProgram } = await import('../src/program.js');
    const { renderSkill } = await import('../scripts/generate-skill.js');
    const program = createProgram();
    const output = renderSkill(program);
    expect(output).toContain('issues');
    expect(output).toContain('projects');
  });
});
