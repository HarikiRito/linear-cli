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
    // Append --plain if the command supports it (has a --plain option registered)
    const hasPlain = cmd.options.some((o) => o.long === '--plain');
    const pathParts = [fullPath, ...argTokens];
    if (hasPlain) pathParts.push('--plain');
    const usagePath = pathParts.join(' ');
    const desc = cmd.description().replace(/\n/g, ' ').replace(/\|/g, '\\|');
    return [{ path: usagePath, description: desc }];
  }

  return subs.flatMap((sub) => collectLeaves(sub, fullPath));
}

const SKILL_DESCRIPTION =
  'Manage Linear issues, projects, and teams via the linear CLI. Use when: the user shares a Linear URL (e.g. https://linear.app/<team>/issue/ENG-123), explicitly mentions Linear, or requests to view, create, update, or work with a Linear issue, project, team, cycle, or document.';

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
    '**Instructions:** When the user shares a Linear ticket URL (e.g. `https://linear.app/<team>/issue/ABC-123`) or asks to work with Linear, use the `linear` CLI to fetch and inspect the relevant data, always passing `--plain` for agent-readable output. If a command reports you are not authenticated, tell the user to run `linear login` themselves — you cannot complete the interactive login. Use `--help` on any command for full option details.\n\n**Read-only by default:** Only perform MUTATIONS (create, update, delete, comment, or any state-changing command) when the user EXPLICITLY requests that specific action. Never create or modify Linear data on your own initiative, and never just because a ticket was mentioned or pasted. When unsure whether the user wants a mutation, ask first — default to read-only.'
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
