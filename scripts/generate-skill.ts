import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Argument, Command } from 'commander';
import { createProgram } from '../src/program.js';

const SKIP_NAME = 'help';

function sortedSubcommands(cmd: Command): Command[] {
  return [...cmd.commands]
    .filter((c) => c.name() !== SKIP_NAME)
    .sort((a, b) => a.name().localeCompare(b.name()));
}

interface LeafRow {
  path: string;
  description: string;
}

function collectLeaves(cmd: Command, prefix: string): LeafRow[] {
  const subs = sortedSubcommands(cmd);
  const fullPath = `${prefix} ${cmd.name()}`;

  if (subs.length === 0) {
    const args: Argument[] = cmd.registeredArguments;
    const argTokens = args.map((a) =>
      a.required ? `<${a.name()}>` : `[${a.name()}]`
    );
    const usagePath = [fullPath, ...argTokens].join(' ');
    const desc = cmd.description().replace(/\n/g, ' ').replace(/\|/g, '\\|');
    return [{ path: usagePath, description: desc }];
  }

  return subs.flatMap((sub) => collectLeaves(sub, fullPath));
}

const SKILL_DESCRIPTION =
  'Manage Linear issues, projects, teams, cycles, and documents from the `linear` CLI.';

export function renderSkill(program: Command): string {
  const leaves = sortedSubcommands(program)
    .flatMap((cmd) => collectLeaves(cmd, 'linear'))
    .sort((a, b) => a.path.localeCompare(b.path));

  const lines: string[] = [];

  lines.push('---');
  lines.push('name: linear-cli');
  lines.push(`description: "${SKILL_DESCRIPTION}"`);
  lines.push('---');
  lines.push('');
  lines.push(
    '<!-- Do not edit by hand — regenerate via `npm run generate:skill` -->'
  );
  lines.push('');
  lines.push(
    '**Always pass `--json`** — JSON is the most reliable, machine-readable output for agents; prefer it on every command. Run `linear login` first to authenticate. Use `--help` on any command for full option details.'
  );
  lines.push('');
  lines.push('## Commands');
  lines.push('');
  lines.push('| Command | Description |');
  lines.push('|---|---|');

  for (const row of leaves) {
    lines.push(`| \`${row.path}\` | ${row.description} |`);
  }

  lines.push('');

  return lines.join('\n');
}

function main(): void {
  const program = createProgram();
  const content = renderSkill(program);

  const outPath = resolve(process.cwd(), 'skill/linear-cli/SKILL.md');
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, content, 'utf8');

  console.log(`Generated: ${outPath}`);
}

// ESM entry guard — only run when executed directly, not when imported in tests
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}
