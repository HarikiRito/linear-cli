import { Command } from 'commander';
import { describe, expect, it } from 'vitest';
import { renderSkill } from '../scripts/generate-skill.js';

function makeProgram(): Command {
  const p = new Command();
  p.exitOverride();
  return p;
}

describe('renderSkill', () => {
  it('renders command name and description', () => {
    const program = makeProgram();
    program.addCommand(new Command('foo').description('Foo command'));
    const output = renderSkill(program);
    expect(output).toContain('foo');
    expect(output).toContain('Foo command');
  });

  it('renders leaf command with full ancestor path', () => {
    const program = makeProgram();
    const parent = new Command('parent');
    parent.addCommand(new Command('child').description('Child cmd'));
    program.addCommand(parent);
    const output = renderSkill(program);
    expect(output).toContain('linear parent child');
    expect(output).toContain('Child cmd');
  });

  it('does NOT emit a row for a group/parent command', () => {
    const program = makeProgram();
    const parent = new Command('parent').description('Parent group');
    parent.addCommand(new Command('child').description('Child cmd'));
    program.addCommand(parent);
    const output = renderSkill(program);
    const tableLines = output
      .split('\n')
      .filter((l) => l.startsWith('|') && !l.startsWith('| Command'));
    expect(tableLines.every((l) => !l.match(/`linear parent`/))).toBe(true);
  });

  it('escapes pipe characters in descriptions', () => {
    const program = makeProgram();
    const cmd = new Command('baz').description('Desc with | pipe');
    program.addCommand(cmd);
    const output = renderSkill(program);
    expect(output).toContain('Desc with \\| pipe');
    expect(output).not.toContain('Desc with | pipe');
  });

  it('table header is present', () => {
    const program = makeProgram();
    const output = renderSkill(program);
    expect(output).toContain('| Command | Description |');
  });

  it('deterministic output — same tree, same string', () => {
    const program = makeProgram();
    program.addCommand(new Command('alpha').description('Alpha command'));
    program.addCommand(new Command('beta').description('Beta command'));
    const out1 = renderSkill(program);
    const out2 = renderSkill(program);
    expect(out1).toBe(out2);
  });

  it('deterministic output — stable ordering', () => {
    const program = makeProgram();
    program.addCommand(new Command('zeta').description('Zeta'));
    program.addCommand(new Command('alpha').description('Alpha'));
    program.addCommand(new Command('moo').description('Moo'));
    const output = renderSkill(program);
    const alphaIdx = output.indexOf('linear alpha');
    const mooIdx = output.indexOf('linear moo');
    const zetaIdx = output.indexOf('linear zeta');
    expect(alphaIdx).toBeLessThan(mooIdx);
    expect(mooIdx).toBeLessThan(zetaIdx);
  });

  it('frontmatter name field', () => {
    const program = makeProgram();
    const output = renderSkill(program);
    expect(output).toMatch(/^---\n/);
    expect(output).toContain('name: linear-cli');
  });

  it('frontmatter description length', () => {
    const program = makeProgram();
    const output = renderSkill(program);
    const match = output.match(/^---\n([\s\S]*?)\n---/);
    expect(match).not.toBeNull();
    const frontmatter = match![1];
    const descMatch = frontmatter.match(/description:\s*"([\s\S]*?)"/);
    expect(descMatch).not.toBeNull();
    const desc = descMatch![1];
    expect(desc.length).toBeGreaterThan(0);
    expect(desc.length).toBeLessThanOrEqual(1536);
  });

  it('auto-generated banner present', () => {
    const program = makeProgram();
    const output = renderSkill(program);
    expect(output).toContain('Do not edit by hand');
  });
});
