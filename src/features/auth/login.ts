import { intro, isCancel, outro, select, spinner, text } from '@clack/prompts';
import { LinearClient } from '@linear/sdk';
import { ResultAsync } from 'neverthrow';
import pc from 'picocolors';
import { getProjectConfigPath, writeConfig, type LinearConfig } from '../../lib/config-file.js';
import { toError } from '../../lib/errors.js';
import { appendAuthToGitignore } from '../../lib/gitignore.js';
import { startOAuthFlow } from './oauth.js';
import {
  deleteSession,
  readSession,
  writeProjectSession,
  writeSession,
} from './session.js';

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
      { value: 'apikey', label: 'API Key' },
      { value: 'oauth', label: 'OAuth2 (browser)' },
    ],
  });

  if (isCancel(method)) {
    process.exit(0);
  }

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
    const validateResult = await ResultAsync.fromPromise(
      (async () => {
        const client = new LinearClient({ apiKey: keyStr });
        await client.viewer;
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

    if (scope === 'project') {
      // Copy the globally-written session to project scope, then remove the global credential
      const globalSession = readSession();
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

    s.stop(pc.green('OAuth2 authentication successful!'));
  }

  if (scope === 'project') {
    // Prompt for default team and workspace
    const teamIdInput = await text({
      message: 'Default team ID or name for this project (optional, press Enter to skip):',
      placeholder: 'e.g. ENG or a UUID',
    });

    const workspaceInput = await text({
      message: 'Default workspace slug for this project (optional, press Enter to skip):',
      placeholder: 'e.g. acme',
    });

    const config: LinearConfig = {};
    if (!isCancel(teamIdInput) && teamIdInput && teamIdInput.trim()) {
      config.team_id = teamIdInput.trim();
    }
    if (!isCancel(workspaceInput) && workspaceInput && workspaceInput.trim()) {
      config.workspace = workspaceInput.trim();
    }

    const configPath = getProjectConfigPath(projectDir);
    const configResult = writeConfig(configPath, config);
    if (configResult.isErr()) {
      console.error(pc.yellow(`Warning: could not write config.toml: ${configResult.error.message}`));
    }

    const gitignoreResult = appendAuthToGitignore(projectDir);
    if (gitignoreResult.isErr()) {
      console.error(pc.yellow(`Warning: could not update .gitignore: ${gitignoreResult.error.message}`));
    }

    outro(pc.green('Project credentials and config saved.'));
  } else {
    outro('You are now logged in.');
  }
}
