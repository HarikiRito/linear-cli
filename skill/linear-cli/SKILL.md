---
name: linear-cli
description: "Manage Linear issues, projects, teams, cycles, and documents from the `linear` CLI."
---

<!-- Do not edit by hand — regenerate via `npm run generate:skill` -->

**Always pass `--json`** — JSON is the most reliable, machine-readable output for agents; prefer it on every command. Run `linear login` first to authenticate. Use `--help` on any command for full option details.

## Commands

| Command | Description |
|---|---|
| `linear cycles list` | List cycles for a team (--team required) |
| `linear documents create` | Create a new document |
| `linear documents get <id>` | Get a single document by ID or slug |
| `linear documents list` | List documents (optionally scoped to a project) |
| `linear documents update <id>` | Update an existing document by ID |
| `linear issues branch <id>` | Get the branch name for an issue (identifier like ENG-123, bare number, or UUID) |
| `linear issues comment add <issue>` | Add a comment to an issue |
| `linear issues comment delete <comment>` | Delete a comment |
| `linear issues comment list <issue>` | List comments on an issue |
| `linear issues comment reply <comment>` | Reply to a comment |
| `linear issues comment update <comment>` | Update a comment body |
| `linear issues create` | Create a new issue |
| `linear issues delete <id>` | Delete an issue (moves to trash) |
| `linear issues get <id>` | Get full detail for a single issue (identifier like ENG-123 or UUID) |
| `linear issues list` | List all issues (optionally filtered by team) |
| `linear issues me` | List issues assigned to you |
| `linear issues query <term>` | Search issues by text term |
| `linear issues update <id>` | Update an issue |
| `linear labels create` | Create a new issue label |
| `linear labels list` | List issue labels (optionally scoped to a team) |
| `linear login` | Authenticate with Linear |
| `linear logout` | Remove stored credentials |
| `linear milestones create` | Create a new project milestone |
| `linear milestones delete <id>` | Delete a milestone by ID |
| `linear milestones get <id>` | Get a single milestone by ID |
| `linear milestones list` | List milestones for a project |
| `linear milestones update <id>` | Update an existing milestone by ID |
| `linear projects create` | Create a new project |
| `linear projects get <id>` | Get project detail by name or UUID |
| `linear projects labels` | List labels for a project |
| `linear projects list` | List all projects |
| `linear projects update <id>` | Update a project by ID or name |
| `linear search-documentation <query>` | Search Linear product documentation (linear.app/docs). NOTE: This command is not currently supported — Linear does not expose a public API for searching its help/product documentation. No GraphQL query and no stable public HTTPS search endpoint are available. |
| `linear statuses get` | Get a workflow state by --name or --id within a --team |
| `linear statuses list` | List workflow states for a team (--team required) |
| `linear teams get <id>` | Get team detail by name, key, or UUID |
| `linear teams list` | List all teams |
| `linear users get <id>` | Get a user by UUID or ID |
| `linear users list` | List all workspace users |
| `linear whoami` | Show the currently authenticated user |
