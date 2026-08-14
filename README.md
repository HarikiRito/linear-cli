# @harikidev/linear-cli

A CLI for Linear designed for agent/programmatic use. Outputs boxed tables for humans and an agent-friendly plain-text format (`--plain`) optimized for AI tooling and scripting.

Repository: https://github.com/HarikiRito/linear-cli

## Install

```bash
npm i -g @harikidev/linear-cli
```

Requires Node >= 20. The binary is `linear`.

## Quickstart

```bash
linear login
linear whoami
```

## Authentication

Credentials are **workspace-keyed**: one session per Linear workspace, stored in `~/.config/.linear/credentials.json`. There is no per-project `.linear/` folder — instead directories are *linked* to a workspace via `linear login` or `linear workspace select`, and the mapping lives in `~/.config/.linear/projects.json`.

Credentials are resolved in this order:

1. `--api-key <key>` / `--token <token>` flags
2. Env vars `LINEAR_API_KEY` / `LINEAR_ACCESS_TOKEN`
3. Linked directory: cwd (or an ancestor) mapped in `projects.json` → that workspace's credential
4. Global default workspace: `LINEAR_WORKSPACE` env or config `workspace`, or auto-selected when exactly one workspace is authenticated
5. Interactive `linear login` (TTY only)

`linear login` authenticates one workspace (OAuth2 or API key), optionally links the current directory, and picks a default team — no scope prompt. `linear workspace select` links an already-authenticated workspace to the current directory (and picks a team). `linear logout` unlinks the current directory and removes its credential when no other directory uses it.

Data files (all under `~/.config/.linear/`):

| File | Purpose |
|---|---|
| `credentials.json` | Workspace-keyed sessions (OAuth or API key); OAuth tokens auto-refresh |
| `projects.json` | Directory-link registry: project root → `{workspace, team}` |
| `config.toml` | Global defaults: `team`, `workspace`, `projects` |
| `keepalive-state.json` | Per-workspace keepalive rotation/backoff state |
| `keepalive/` | Per-workspace rotation locks (`<workspace-id>.lock`) |

> **Migrating from the old per-project model:** `.linear/auth.json` and `.linear/config.toml` no longer exist. Re-run `linear login` once per workspace, then `linear workspace select` in each directory you work from.

## Command Reference

Most commands accept these common flags (not repeated per command):

| Flag | Description |
|---|---|
| `--plain` | Output agent-friendly plain key:value text (only relevant fields) |
| `--api-key <key>` | Linear API key |
| `--token <token>` | Linear access token |

List commands also accept: `--limit <n>` (default 50), `--after <cursor>`, `--all` (fetch all pages).

### Global

| Command | Description |
|---|---|
| `linear login` | Authenticate a workspace (OAuth2 or API key). Optionally links cwd and picks the default team (TTY only) |
| `linear logout` | Unlink cwd and remove its credential if orphaned. `--workspace <id>`: remove one workspace's credentials. `--all`: wipe all workspace credentials |
| `linear workspace select` | Link the current directory to an authenticated workspace (validates the token, picks a team). Re-linkable |
| `linear team select` | Pick default team/projects: sets the cwd link's team when the directory is linked, otherwise the global config |
| `linear whoami` | Show the resolved user + workspace + bound team for cwd. Does not start interactive login when unauthenticated — run `linear login` first. |
| `linear keepalive install` | Install the global polling scheduler (one-time) that keeps all authenticated workspace sessions alive |
| `linear keepalive uninstall` | Remove the scheduler |
| `linear keepalive status` | Show scheduler state, per-workspace rotation state, and linked directories |
| `linear keepalive run` | Run one rotation cycle manually (used by the scheduler) |

### Issues

| Command | Description |
|---|---|
| `linear issues list` | List issues. `--team`, `--state <tokens>` (comma-sep snake_case, e.g. `todo,in_progress,dev_review`; default: `todo,in_progress,dev_review`), `--all-states` |
| `linear issues get <id>` | Full issue detail. Accepts `ENG-123`, bare number, or UUID |
| `linear issues me` | Issues assigned to you. `--state`, `--all-states` |
| `linear issues query <term>` | Search issues by text. `--state`, `--all-states` |
| `linear issues create` | Create an issue. Required: `--title <text>`, `--team <name-or-id>`. Optional: `--description <text\|->`, `--project`, `--milestone` (needs `--project`), `--assignee`, `--labels <csv>`, `--state`, `--priority <0-4>` (0=None 1=Urgent 2=High 3=Medium 4=Low), `--estimate`, `--cycle`, `--parent`, `--due-date <YYYY-MM-DD>` |
| `linear issues update <id>` | Update an issue. Same optional fields as create. `--labels` replaces all. `--state`/`--cycle` resolve correctly only when `--team` is also provided |
| `linear issues delete <id>` | Move issue to trash. `--yes` skips confirmation |

### Issue Comments

| Command | Description |
|---|---|
| `linear issues comment list <issue>` | List comments on an issue |
| `linear issues comment add <issue> --body <text\|->` | Add a comment |
| `linear issues comment reply <comment> --body <text\|->` | Reply to a comment |
| `linear issues comment update <comment> --body <text\|->` | Edit a comment |
| `linear issues comment delete <comment>` | Delete a comment. `--yes` skips confirmation |

### Issue Branch

| Command | Description |
|---|---|
| `linear issues branch <id>` | Print the git branch name for an issue. `--checkout` runs `git checkout -b <name>` |

### Projects

| Command | Description |
|---|---|
| `linear projects list` | List all projects |
| `linear projects get <id>` | Project detail by name or UUID |
| `linear projects create` | Create a project. Required: `--name <text>`, `--team <key-or-id>`. Optional: `--description`, `--lead <name-or-id\|me>`, `--target-date <YYYY-MM-DD>`, `--start-date <YYYY-MM-DD>`, `--state`/`--status` |
| `linear projects update <id>` | Update a project. Same optional fields as create. `--team <key-or-id>` optional |
| `linear projects labels --project <id-or-name>` | List labels for a project |

### Teams

| Command | Description |
|---|---|
| `linear teams list` | List all teams |
| `linear teams get <id>` | Team detail by name, key, or UUID |

### Labels

| Command | Description |
|---|---|
| `linear labels list` | List issue labels. Optional: `--team <key-or-id>` |
| `linear labels create --name <name>` | Create a label. Optional: `--color <hex>`, `--team <key-or-id>` (omit for workspace-level), `--description` |

### Statuses

| Command | Description |
|---|---|
| `linear statuses list --team <key-or-id>` | List workflow states for a team |
| `linear statuses get --team <key-or-id>` | Get a workflow state. `--name <name>` or `--id <uuid>` |

### Cycles

| Command | Description |
|---|---|
| `linear cycles list --team <key-or-id>` | List cycles for a team |

### Milestones

| Command | Description |
|---|---|
| `linear milestones list --project <id-or-name>` | List milestones for a project |
| `linear milestones get <id>` | Milestone detail |
| `linear milestones create --project <id-or-name> --name <name>` | Create a milestone. Optional: `--target-date <YYYY-MM-DD>`, `--description` |
| `linear milestones update <id>` | Update a milestone. Optional: `--name`, `--target-date`, `--description` |
| `linear milestones delete <id>` | Delete a milestone. `--yes` skips confirmation |

### Documents

| Command | Description |
|---|---|
| `linear documents list` | List documents. Optional: `--project <id-or-name>` |
| `linear documents get <id>` | Document detail by ID or slug |
| `linear documents create --title <title>` | Create a document. Optional: `--project`, `--content <text\|->`, `--content-file <path>` |
| `linear documents update <id>` | Update a document. Optional: `--title`, `--content <text\|->`, `--content-file <path>` |

### Users

| Command | Description |
|---|---|
| `linear users list` | List workspace users |
| `linear users get <id>` | User detail by UUID or ID |

## Output & Pagination

Default output is a boxed table (TTY) or markdown table when piped. Use `--plain` for agent-friendly plain-text output optimized for AI tooling.

List commands paginate with `--limit <n>` (default 50), `--after <cursor>` for next-page cursor, or `--all` to fetch all pages automatically.

## Plain Output Format (--plain)

`--plain` emits a minimal, structured text format designed for LLM consumption:

- **Header line** per record: `<Type>: <id>` (e.g. `Issue: ENG-123`)
- **Fields** as `key: value`, one per line; null/empty fields are omitted
- **Nested relations** are shown by name or identifier, not internal IDs
- **Multi-line fields** (e.g. description) are wrapped in a sentinel block:
  ```
  description: |<<
  First line of description.
  Second line.
  <<END
  ```
- **List output**: records separated by a line of exactly `---`

Example — `linear issues get ENG-123 --plain`:

```
Issue: ENG-123
title: Fix authentication timeout
state: In Progress
assignee: Jane Smith
priority: High
description: |<<
Users are experiencing session timeouts after 5 minutes
even when actively using the app.
<<END
```

Example — `linear issues list --plain`:

```
Issue: ENG-123
title: Fix authentication timeout
state: In Progress
assignee: Jane Smith
---
Issue: ENG-124
title: Update onboarding flow
state: Todo
assignee: Bob Lee
```

## Claude Code Skill

A Claude Code skill is hand-authored and maintained at `skill/linear-cli/SKILL.md`. The skill includes every command with `--plain` appended and provides:

- A Linear-specific trigger so Claude Code routes relevant requests to this skill
- A **read-only-by-default guardrail** — the agent only performs mutations (create, update, delete) when the user explicitly asks

Agent users should always pass `--plain` to get output in the format the skill expects.

## Config File

Global config lives at `~/.config/.linear/config.toml`. Project-local `config.toml` was removed — defaults are global only; per-directory overrides come from the `projects.json` link (its `team`).

```toml
[team]
id = "xxx"
key = "ENG"   # default team for issue commands

workspace = "myorg"  # default workspace (must match an authenticated workspace id)

[[projects]]
id = "yyy"
name = "API"  # default project(s) for the default team
```

All keys are optional. Environment overrides: `LINEAR_TEAM_ID` → default team, `LINEAR_WORKSPACE` → `workspace`.

## Contributing

Issues and pull requests are welcome at https://github.com/HarikiRito/linear-cli. To report a bug or request a feature, open an issue at https://github.com/HarikiRito/linear-cli/issues.
