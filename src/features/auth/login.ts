import { intro, isCancel, outro, select, spinner, text } from '@clack/prompts';
import { LinearClient } from '@linear/sdk';
import { ResultAsync } from 'neverthrow';
import pc from 'picocolors';
import {
  getGlobalConfigPath,
  getProjectConfigPath,
  type LinearConfig,
  readConfig,
  writeConfig,
} from '../../lib/config-file.js';
import { toError } from '../../lib/errors.js';
import { appendAuthToGitignore } from '../../lib/gitignore.js';
import { startOAuthFlow } from './oauth.js';
import { deleteSession, readSession, writeProjectSession, writeSession } from './session.js';

/**
 * Fetch the authenticated user's teams and let them pick a default team for
 * this login. Applies to both API-key and OAuth paths, and both Global and
 * Project save scopes. When exactly one team exists it is pre-selected as the
 * initial value — the user still confirms via Enter, the prompt is not skipped.
 * Returns undefined if the fetch fails, no teams exist, or the user cancels —
 * callers should treat that as "no default team selected" (non-fatal).
 */
async function selectDefaultTeam(client: LinearClient): Promise<string | undefined> {
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

  return picked;
}

export async function runLoginFlow(): Promise<void> {
  intro(pc.bold('Linear CLI Login'));

  const scope = await select({
    message: 'Save credentials to:',
    options: [
      { value: 'global', label: 'Global (~/.config/.linear/)', hint: 'default' },
      { value: 'project', label: 'Project (./.linear/)' },
    ],
    initialValue: 'global',
  });

  if (isCancel(scope)) {
    process.exit(0);
  }

  const projectDir = process.cwd();

  const method = await select({
    message: 'How would you like to authenticate?',
    options: [
      { value: 'oauth', label: 'OAuth2 (browser)' },
      { value: 'apikey', label: 'API Key' },
    ],
  });

  if (isCancel(method)) {
    process.exit(0);
  }

  // Client used to fetch teams after a successful auth — set by whichever
  // method branch below succeeds.
  let client: LinearClient | undefined;

  if (method === 'apikey') {
    const key = await text({
      message: 'Enter your Linear API key:',
      placeholder: 'lin_api_...',
      validate: (v) => (v.trim().length === 0 ? 'API key cannot be empty' : undefined),
    });

    if (isCancel(key)) {
      process.exit(0);
    }

    const s = spinner();
    s.start('Validating API key...');

    const keyStr = key.trim();
    // Constructing LinearClient can itself throw synchronously on a malformed
    // key — keep it inside the async boundary so that surfaces as a normal
    // validation failure rather than an uncaught exception.
    let candidateClient: LinearClient | undefined;
    const validateResult = await ResultAsync.fromPromise(
      (async () => {
        candidateClient = new LinearClient({ apiKey: keyStr });
        await candidateClient.viewer;
      })(),
      toError
    );

    if (validateResult.isErr()) {
      s.stop(pc.red('Invalid API key'));
      process.exit(1);
    }

    const result =
      scope === 'project'
        ? writeProjectSession(projectDir, { apiKey: keyStr })
        : writeSession({ apiKey: keyStr });
    if (result.isErr()) {
      s.stop(pc.red(`Failed to save credentials: ${result.error.message}`));
      process.exit(1);
    }

    client = candidateClient;
    s.stop(pc.green('API key validated and saved!'));
  } else if (method === 'oauth') {
    const s = spinner();
    s.start('Starting OAuth2 flow — check your browser...');

    // startOAuthFlow always writes to global session
    const result = await startOAuthFlow();
    if (result.isErr()) {
      s.stop(pc.red(`OAuth2 failed: ${result.error.message}`));
      process.exit(1);
    }

    // startOAuthFlow always writes here first — read it back to build a client
    // for the team-select step below, and to relocate it for project scope.
    const globalSession = readSession();

    if (scope === 'project') {
      if (globalSession) {
        const writeResult = writeProjectSession(projectDir, globalSession);
        if (writeResult.isErr()) {
          s.stop(pc.red(`Failed to save project credentials: ${writeResult.error.message}`));
          process.exit(1);
        }
        // Credential now lives only in project scope — remove the stale global copy
        deleteSession();
      }
    }

    if (globalSession && 'accessToken' in globalSession) {
      client = new LinearClient({ accessToken: globalSession.accessToken });
    }

    s.stop(pc.green('OAuth2 authentication successful!'));
  }

  // Fetch and select a default team — applies to both Global and Project scope,
  // and both API-key and OAuth paths (login flow redesign).
  const teamId = client ? await selectDefaultTeam(client) : undefined;

  // Only touch config.toml when this run actually resolved a team — never
  // write on failure/cancel, so a pre-existing team_id/workspace in the
  // config is left untouched rather than silently wiped by an empty write.
  if (teamId) {
    const configPath =
      scope === 'project' ? getProjectConfigPath(projectDir) : getGlobalConfigPath();

    let existingConfig: LinearConfig = {};
    try {
      existingConfig = readConfig(configPath);
    } catch (e) {
      console.error(
        pc.yellow(
          `Warning: could not read existing config.toml, it will be overwritten: ${toError(e).message}`
        )
      );
    }

    // Merge onto the existing config so unrelated keys (including legacy
    // `workspace`) survive; only team_id is updated by this run.
    const config: LinearConfig = { ...existingConfig, team_id: teamId };
    const configResult = writeConfig(configPath, config);
    if (configResult.isErr()) {
      console.error(
        pc.yellow(`Warning: could not write config.toml: ${configResult.error.message}`)
      );
    }
  }

  if (scope === 'project') {
    const gitignoreResult = appendAuthToGitignore(projectDir);
    if (gitignoreResult.isErr()) {
      console.error(
        pc.yellow(`Warning: could not update .gitignore: ${gitignoreResult.error.message}`)
      );
    }

    outro(pc.green('Project credentials and config saved.'));
  } else {
    outro('You are now logged in.');
  }
}
