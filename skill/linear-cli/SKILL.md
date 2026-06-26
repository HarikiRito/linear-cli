---
name: linear-cli
description: "Manage Linear issues, projects, and teams via the linear CLI. Use when: the user shares a Linear URL (e.g. https://linear.app/<team>/issue/ENG-123), explicitly mentions Linear, or requests to view, create, update, or work with a Linear issue, project, team, cycle, or document."
---

**Instructions:** When the user shares a Linear ticket URL (e.g. `https://linear.app/<team>/issue/ABC-123`) or asks to work with Linear, use the `linear` CLI to fetch and inspect the relevant data, always passing `--plain` for agent-readable output. If a command reports you are not authenticated, tell the user to run `linear login` themselves — you cannot complete the interactive login. Use `--help` on any command for full option details.

**Read-only by default:** Only perform MUTATIONS (create, update, delete, comment, or any state-changing command) when the user EXPLICITLY requests that specific action. Never create or modify Linear data on your own initiative, and never just because a ticket was mentioned or pasted. When unsure whether the user wants a mutation, ask first — default to read-only.

## Commands

| Command | Description |
|---|---|
| `linear cycles list --plain` | List cycles for a team |
| `linear documents create --plain` | Create a new document |
| `linear documents get <id> --plain` | Get a single document by ID or slug |
| `linear documents list --plain` | List documents (optionally scoped to a project) |
| `linear documents update <id> --plain` | Update an existing document by ID |
| `linear issues branch <id>` | Get the branch name for an issue (identifier like ENG-123, bare number, or UUID) |
| `linear issues comment add <issue> --plain` | Add a comment to an issue |
| `linear issues comment delete <comment>` | Delete a comment |
| `linear issues comment list <issue> --plain` | List comments on an issue |
| `linear issues comment reply <comment> --plain` | Reply to a comment |
| `linear issues comment update <comment> --plain` | Update a comment body |
| `linear issues create --plain` | Create a new issue |
| `linear issues delete <id>` | Delete an issue (moves to trash) |
| `linear issues get <id> --plain` | Get full detail for a single issue (identifier like ENG-123 or UUID) |
| `linear issues list --plain` | List all issues (optionally filtered by team) |
| `linear issues me --plain` | List issues assigned to you |
| `linear issues query <term> --plain` | Search issues by text term |
| `linear issues update <id> --plain` | Update an issue |
| `linear labels create --plain` | Create a new issue label |
| `linear labels list --plain` | List issue labels (optionally scoped to a team) |
| `linear login` | Authenticate with Linear |
| `linear logout` | Remove stored credentials |
| `linear milestones create --plain` | Create a new project milestone |
| `linear milestones delete <id>` | Delete a milestone by ID |
| `linear milestones get <id> --plain` | Get a single milestone by ID |
| `linear milestones list --plain` | List milestones for a project |
| `linear milestones update <id> --plain` | Update an existing milestone by ID |
| `linear projects create --plain` | Create a new project |
| `linear projects get <id> --plain` | Get project detail by name or UUID |
| `linear projects labels --plain` | List labels for a project |
| `linear projects list --plain` | List all projects |
| `linear projects update <id> --plain` | Update a project by ID or name |
| `linear search-documentation <query>` | Search Linear product documentation (linear.app/docs). NOTE: This command is not currently supported — Linear does not expose a public API for searching its help/product documentation. No GraphQL query and no stable public HTTPS search endpoint are available. |
| `linear statuses get --plain` | Get a single status by name or ID |
| `linear statuses list --plain` | List all workflow statuses for a team |
| `linear teams get <id> --plain` | Get team detail by name, key, or UUID |
| `linear teams list --plain` | List all teams |
| `linear users get <id> --plain` | Get a user by UUID or ID |
| `linear users list --plain` | List all workspace users |
| `linear whoami --plain` | Show the currently authenticated user |
