---
name: linear-cli
description: "Manage Linear issues, projects, and teams via the linear CLI. Use when: the user shares a Linear URL (e.g. https://linear.app/<team>/issue/ENG-123), explicitly mentions Linear, or requests to view, create, update, or work with a Linear issue, project, team, cycle, or document."
---

**Instructions:** When the user shares a Linear ticket URL or asks to work with Linear, use the `linear` CLI. If a command reports you are not authenticated, tell the user to run `linear login` themselves. Use `--help` on any command for full option details.

**Read-only by default:** Only perform MUTATIONS (create, update, delete, comment) when the user EXPLICITLY requests it. Default to read-only.

## Authoring content (IMPORTANT)

All Linear content is Markdown. ALWAYS write issue descriptions and comment bodies as Markdown.

For any non-trivial or multiline body, pass it via stdin using `-` (e.g. `--description -` or `--body -`) with a heredoc — do NOT pass inline raw strings (they break formatting and escaping):

```sh
linear issues create --title "Bug: login fails" --team ENG --description - <<'EOF'
## Steps to reproduce

1. Go to /login
2. Submit empty form

**Expected:** validation error
**Actual:** 500 error
EOF
```

## Reading output

Append `--plain` to any read command for clean, agent-parseable output.

## Issue & comment commands

| Command | Key flags |
|---|---|
| `linear issues list` | `--team <key>`, `--state <tokens>`, `--all-states`, `--limit <n>`, `--all` |
| `linear issues get <id>` | — |
| `linear issues me` | — |
| `linear issues query <term>` | — |
| `linear issues create` | `--title <text>` (req), `--team <name-or-id>` (req), `--description <text\|->`, `--project`, `--milestone`, `--assignee`, `--labels`, `--state`, `--priority <0-4>`, `--estimate`, `--cycle`, `--parent`, `--due-date` |
| `linear issues update <id>` | same flags as create (all optional) |
| `linear issues delete <id>` | — |
| `linear issues branch <id>` | — |
| `linear issues comment list <issue>` | `--limit <n>` |
| `linear issues comment add <issue>` | `--body <text\|->` (req) |
| `linear issues comment reply <comment>` | `--body <text\|->` (req) |
| `linear issues comment update <comment>` | `--body <text\|->` (req) |
| `linear issues comment delete <comment>` | `--yes` |

All read commands (list, get, me, query, comment list) accept `--plain`.

## Other commands

Run `linear --help` and `linear <area> --help` to discover commands for: projects, cycles, documents, teams, labels, milestones, statuses, users, whoami.
