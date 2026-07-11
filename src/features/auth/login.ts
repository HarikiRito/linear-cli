import { intro, isCancel, outro, select, spinner, text } from '@clack/prompts';
import type { LinearClient } from '@linear/sdk';
import { ResultAsync } from 'neverthrow';
import pc from 'picocolors';
import { buildLinearClient } from '../../lib/client/index.js';
import { getGlobalConfigPath, getProjectConfigPath } from '../../lib/config-file.js';
import { toError } from '../../lib/errors.js';
import { appendAuthToGitignore } from '../../lib/gitignore.js';
import { startOAuthFlow } from './oauth.js';
import { deleteSession, readSession, writeProjectSession, writeSession } from './session.js';
import { selectAndPersistTeamAndProjects } from './team-select.js';

/**
 * Prompt for an authentication method (OAuth2 or API key), run it to
 * completion, and persist the resulting session to the given scope. Shared
 * by `runLoginFlow()` (where `scope` comes from an earlier prompt) and the
 * standalone `linear team select` command's no-valid-session fallback (where
 * `scope` is hardcoded to 'project' and the scope prompt is skipped
 * entirely). Returns a LinearClient built from the newly-authenticated
 * session, or undefined if the method prompt was cancelled — callers that
 * need a hard failure (as `runLoginFlow()` does on invalid credentials) rely
 * on this function's internal process.exit() calls rather than a return
 * value.
 */
export async function runAuthMethodFlow(
  scope: 'global' | 'project',
  projectDir: string
): Promise<LinearClient | undefined> {
  const method = await select<'oauth' | 'apikey'>({
    message: 'How would you like to authenticate?',
    options: [
      { value: 'oauth', label: 'OAuth2 (browser)' },
      { value: 'apikey', label: 'API Key' },
    ],
  });

  if (isCancel(method)) {
    process.exit(0);
  }

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
        candidateClient = buildLinearClient({ type: 'apiKey', value: keyStr });
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
      client = buildLinearClient({ type: 'accessToken', value: globalSession.accessToken });
    }

    s.stop(pc.green('OAuth2 authentication successful!'));
  }

  return client;
}

export async function runLoginFlow(): Promise<void> {
  intro(pc.bold('Linear CLI Login'));

  const scope = await select<'global' | 'project'>({
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

  // Client used to fetch teams after a successful auth — set by whichever
  // method branch inside runAuthMethodFlow succeeds.
  const client = await runAuthMethodFlow(scope, projectDir);

  // Fetch/select a default team, then default project(s) scoped to that
  // team, then persist both to config.toml — applies to both Global and
  // Project scope, and both API-key and OAuth paths. Only attempted when a
  // client was actually resolved.
  if (client) {
    const configPath =
      scope === 'project' ? getProjectConfigPath(projectDir) : getGlobalConfigPath();
    await selectAndPersistTeamAndProjects(client, configPath);
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
