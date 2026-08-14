import { isCancel, multiselect, select } from '@clack/prompts';
import type { LinearClient } from '@linear/sdk';
import { ResultAsync } from 'neverthrow';
import pc from 'picocolors';
import {
  type DefaultProject,
  type DefaultTeam,
  getGlobalConfigPath,
  type LinearConfig,
  readConfig,
  writeConfig,
} from '../../lib/config-file.js';
import { toError } from '../../lib/errors.js';
import { updateEntry } from '../keepalive/registry.js';

/**
 * Fetch the authenticated user's teams and let them pick a default team.
 * Applies to both API-key and OAuth paths, and both Global and Project save
 * scopes, as well as the standalone `team select` command. When exactly one
 * team exists it is pre-selected as the initial value — the user still
 * confirms via Enter, the prompt is not skipped.
 *
 * Returns both `id` and `key` (not just the bare id) so callers can persist
 * a human-readable config alongside the id. Returns undefined if the fetch
 * fails, no teams exist, or the user cancels — callers should treat that as
 * "no default team selected" (non-fatal).
 */
export async function selectDefaultTeam(client: LinearClient): Promise<DefaultTeam | undefined> {
  const teamsResult = await ResultAsync.fromPromise(
    (async () => {
      const c = await client.teams();
      return c.nodes;
    })(),
    toError
  );

  if (teamsResult.isErr()) {
    console.error(pc.yellow(`Warning: could not fetch teams: ${teamsResult.error.message}`));
    return undefined;
  }

  const teams = teamsResult.value;
  if (teams.length === 0) {
    return undefined;
  }

  const options = teams.map((t) => ({ value: t.id, label: `${t.name} (${t.key})` }));
  const initialValue = teams.length === 1 ? teams[0].id : undefined;

  const picked = await select({
    message: 'Default team for this project:',
    options,
    initialValue,
  });

  if (isCancel(picked)) {
    return undefined;
  }

  const team = teams.find((t) => t.id === picked);
  return team ? { id: team.id, key: team.key } : undefined;
}

/**
 * Fetch projects scoped to the given team and let the user pick zero or more
 * as the default `projects` for this login/selection. Applies to both Global
 * and Project save scopes, as well as the standalone `team select` command.
 * Selecting zero projects is a valid outcome (it simply means no project
 * default is configured) — not treated as an error or a cancellation.
 * Returns undefined if the fetch fails, no projects exist for the team, the
 * user selects nothing, or the user cancels — callers should treat that as
 * "no default projects selected" (non-fatal), mirroring selectDefaultTeam.
 *
 * Returns `{id, name}[]` (not just bare ids) so callers can persist a
 * human-readable config alongside each id.
 */
export async function selectDefaultProjects(
  client: LinearClient,
  teamId: string
): Promise<DefaultProject[] | undefined> {
  const projectsResult = await ResultAsync.fromPromise(
    (async () => {
      const team = await client.team(teamId);
      const c = await team.projects();
      return c.nodes;
    })(),
    toError
  );

  if (projectsResult.isErr()) {
    console.error(pc.yellow(`Warning: could not fetch projects: ${projectsResult.error.message}`));
    return undefined;
  }

  const projects = projectsResult.value;
  if (projects.length === 0) {
    return undefined;
  }

  const options = projects.map((p) => ({ value: p.id, label: p.name }));

  const picked = await multiselect({
    message: 'Default project(s) for this team (optional — space to toggle, enter to confirm):',
    options,
    required: false,
  });

  if (isCancel(picked)) {
    return undefined;
  }

  if (picked.length === 0) {
    return undefined;
  }

  const projectById = new Map(projects.map((p) => [p.id, p]));
  return picked.map((id) => {
    const p = projectById.get(id);
    return { id, name: p?.name ?? id };
  });
}

/**
 * Shared "team-select → project-select → persist" sequence used by both
 * `runLoginFlow()` and the standalone `linear team select` command.
 *
 * Persist target:
 * - registry (`{type:'registry', root}`) — the linked directory's team goes
 *   to its registry entry; projects always land in the global config.
 * - global — team + projects both go to the global config.toml.
 *
 * Only touches config when a team was actually resolved — never writes on
 * failure/cancel, so a pre-existing `team`/`projects` in the config survives.
 * The write merges onto the existing config so unrelated keys (e.g.
 * `workspace`) survive; `projects` is only included when the picker resolved
 * a non-empty selection.
 */
export type TeamPersistTarget = { type: 'registry'; root: string } | { type: 'global' };

export async function selectAndPersistTeamAndProjects(
  client: LinearClient,
  target: TeamPersistTarget
): Promise<void> {
  const team = await selectDefaultTeam(client);

  // Project picker is team-scoped, so it has nothing to query without a team.
  const projects = team ? await selectDefaultProjects(client, team.id) : undefined;

  if (!team) return;

  if (target.type === 'registry') {
    // Linked dir: team override lives on the registry entry.
    const updateResult = await updateEntry(target.root, { team });
    if (updateResult.isErr()) {
      console.error(
        pc.yellow(`Warning: could not update registry entry: ${updateResult.error.message}`)
      );
    }
  }

  let existingConfig: LinearConfig = {};
  try {
    existingConfig = readConfig(getGlobalConfigPath());
  } catch (e) {
    console.error(
      pc.yellow(
        `Warning: could not read existing config.toml, it will be overwritten: ${toError(e).message}`
      )
    );
  }

  const config: LinearConfig = {
    ...existingConfig,
    ...(target.type === 'global' ? { team } : {}),
    ...(projects && projects.length > 0 ? { projects } : {}),
  };
  const configResult = writeConfig(getGlobalConfigPath(), config);
  if (configResult.isErr()) {
    console.error(pc.yellow(`Warning: could not write config.toml: ${configResult.error.message}`));
  }
}
