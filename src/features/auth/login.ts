import { confirm, intro, isCancel, outro, select, spinner, text } from '@clack/prompts';
import type { LinearClient } from '@linear/sdk';
import { ResultAsync } from 'neverthrow';
import pc from 'picocolors';
import { notifyUpdate } from '../../lib/check-version.js';
import { buildLinearClient } from '../../lib/client/index.js';
import { toError } from '../../lib/errors.js';
import { linkProject } from '../keepalive/registry.js';
import { writeWorkspaceCredential } from './credentials.js';
import { startOAuthFlow } from './oauth.js';
import { isOAuthSession, type Session } from './session.js';
import { selectAndPersistTeamAndProjects } from './team-select.js';

export interface AuthenticatedWorkspace {
  workspaceId: string;
  name: string;
  urlKey: string;
  session: Session;
  client: LinearClient;
}

/**
 * Prompt for an authentication method (OAuth2 or API key), run it to
 * completion, and return the authenticated workspace identity WITHOUT
 * persisting anything — callers write the credential via
 * `writeWorkspaceCredential(workspaceId, session)`. Shared by `runLoginFlow()`
 * and `linear workspace select`'s "authenticate a new workspace" path. Exits
 * the process on cancel or invalid credentials (callers treat a return as
 * success).
 */
export async function authenticateWorkspace(): Promise<AuthenticatedWorkspace> {
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
    let client: LinearClient | undefined;
    // Constructing LinearClient can itself throw synchronously on a malformed
    // key — keep it inside the async boundary so that surfaces as a normal
    // validation failure rather than an uncaught exception.
    const validateResult = await ResultAsync.fromPromise(
      (async () => {
        client = buildLinearClient({ type: 'apiKey', value: keyStr });
        const org = await client.organization;
        return org;
      })(),
      toError
    );

    if (validateResult.isErr()) {
      s.stop(pc.red('Invalid API key'));
      process.exit(1);
    }

    const org = validateResult.value;
    s.stop(pc.green('API key validated!'));
    return {
      workspaceId: org.id,
      name: org.name,
      urlKey: org.urlKey,
      session: { apiKey: keyStr },
      client: client as LinearClient,
    };
  }

  // OAuth — startOAuthFlow returns the session without writing anything.
  const s = spinner();
  s.start('Starting OAuth2 flow — check your browser...');

  const flowResult = await startOAuthFlow();
  if (flowResult.isErr()) {
    s.stop(pc.red(`OAuth2 failed: ${flowResult.error.message}`));
    process.exit(1);
  }
  const session = flowResult.value;
  const client = buildLinearClient({ type: 'accessToken', value: session.accessToken });

  const orgResult = await ResultAsync.fromPromise(client.organization, toError);
  if (orgResult.isErr()) {
    s.stop(pc.red(`OAuth2 failed: ${orgResult.error.message}`));
    process.exit(1);
  }
  const org = orgResult.value;
  s.stop(pc.green('OAuth2 authentication successful!'));
  return { workspaceId: org.id, name: org.name, urlKey: org.urlKey, session, client };
}

export async function runLoginFlow(): Promise<void> {
  intro(pc.bold('Linear CLI Login'));

  const { workspaceId, name, urlKey, session, client } = await authenticateWorkspace();
  await writeWorkspaceCredential(workspaceId, session);

  const cwd = process.cwd();
  let linkedRoot: string | null = null;

  if (process.stdout.isTTY && process.stdin.isTTY) {
    const link = await confirm({
      message: `Link this directory to workspace ${name}?`,
      initialValue: true,
    });
    if (!isCancel(link) && link === true) {
      const linkResult = await ResultAsync.fromPromise(linkProject(cwd, workspaceId), toError);
      if (linkResult.isErr()) {
        console.error(
          pc.yellow(`Warning: could not link this directory: ${linkResult.error.message}`)
        );
      } else {
        linkedRoot = linkResult.value.root;
      }
    }

    // Team pick: linked → registry entry; otherwise global config.
    await selectAndPersistTeamAndProjects(
      client,
      linkedRoot ? { type: 'registry', root: linkedRoot } : { type: 'global' }
    );
  }

  if (linkedRoot) {
    console.log(pc.green(`Linked ${cwd} → ${name}`));
  } else {
    console.log(pc.green(`Authenticated workspace: ${name} (${urlKey})`));
  }

  if (isOAuthSession(session)) {
    console.log(
      pc.cyan('Tip: run `linear keepalive install` once to keep this session alive automatically.')
    );
  }

  outro(pc.green('Login complete.'));

  // Fire-and-forget: don't block CLI exit on this best-effort notice.
  void notifyUpdate();
}
