import { intro, isCancel, outro, select, spinner, text } from '@clack/prompts';
import { LinearClient } from '@linear/sdk';
import pc from 'picocolors';
import { startOAuthFlow } from './oauth.js';
import { writeSession } from './session.js';

export async function runLoginFlow(): Promise<void> {
  intro(pc.bold('Linear CLI Login'));

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

    try {
      const keyStr = String(key);
      const client = new LinearClient({ apiKey: keyStr });
      await client.viewer;

      const result = writeSession({ apiKey: keyStr });
      if (result.isErr()) {
        s.stop(pc.red(`Failed to save credentials: ${result.error.message}`));
        process.exit(1);
      }
      s.stop(pc.green('API key validated and saved!'));
      outro('You are now logged in.');
    } catch {
      s.stop(pc.red('Invalid API key'));
      process.exit(1);
    }
  } else if (method === 'oauth') {
    const s = spinner();
    s.start('Starting OAuth2 flow — check your browser...');

    const result = await startOAuthFlow();
    if (result.isErr()) {
      s.stop(pc.red(`OAuth2 failed: ${result.error.message}`));
      process.exit(1);
    }
    s.stop(pc.green('OAuth2 authentication successful!'));
    outro('You are now logged in.');
  }
}
