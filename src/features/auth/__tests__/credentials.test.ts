import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as scopeMod from '../../../lib/scope.js';
import {
  deleteWorkspaceCredential,
  getCredentialsPath,
  listWorkspaceCredentials,
  listWorkspaceIds,
  readCredentialsStore,
  readWorkspaceCredential,
  writeCredentialsStore,
  writeWorkspaceCredential,
} from '../credentials.js';
import type { Session } from '../session.js';

const oauthSession: Session = {
  accessToken: 'at-1',
  refreshToken: 'rt-1',
  expiresAt: 1234567890,
  lastRefreshAt: 1234567800,
};

const apiKeySession: Session = { apiKey: 'key-1' };

describe('workspace credentials store', () => {
  let tmpHome: string;

  beforeEach(() => {
    tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'linear-creds-home-'));
    vi.spyOn(scopeMod, 'getGlobalConfigDir').mockReturnValue(tmpHome);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    fs.rmSync(tmpHome, { recursive: true, force: true });
  });

  it('readCredentialsStore on missing file returns empty store', async () => {
    await expect(readCredentialsStore()).resolves.toEqual({ workspaces: {} });
  });

  it('writeWorkspaceCredential then readWorkspaceCredential round-trips OAuthSession and ApiKeySession', async () => {
    await writeWorkspaceCredential('ws-oauth', oauthSession);
    await writeWorkspaceCredential('ws-key', apiKeySession);

    await expect(readWorkspaceCredential('ws-oauth')).resolves.toEqual(oauthSession);
    await expect(readWorkspaceCredential('ws-key')).resolves.toEqual(apiKeySession);
  });

  it('multiple workspaces coexist', async () => {
    await writeWorkspaceCredential('ws-a', apiKeySession);
    await writeWorkspaceCredential('ws-b', oauthSession);

    await expect(readWorkspaceCredential('ws-a')).resolves.toEqual(apiKeySession);
    await expect(readWorkspaceCredential('ws-b')).resolves.toEqual(oauthSession);
    await expect(listWorkspaceIds()).resolves.toEqual(expect.arrayContaining(['ws-a', 'ws-b']));
  });

  it('overwrite same workspace id replaces the session', async () => {
    await writeWorkspaceCredential('ws-a', apiKeySession);
    const replaced: Session = { apiKey: 'key-2' };
    await writeWorkspaceCredential('ws-a', replaced);

    await expect(readWorkspaceCredential('ws-a')).resolves.toEqual({ apiKey: 'key-2' });
    await expect(listWorkspaceIds()).resolves.toEqual(['ws-a']);
  });

  it('deleteWorkspaceCredential returns true when exists, false when absent, and deletes', async () => {
    await writeWorkspaceCredential('ws-a', apiKeySession);
    await writeWorkspaceCredential('ws-b', oauthSession);

    await expect(deleteWorkspaceCredential('ws-a')).resolves.toBe(true);
    await expect(readWorkspaceCredential('ws-a')).resolves.toBeNull();
    await expect(deleteWorkspaceCredential('ws-a')).resolves.toBe(false);

    // other workspace untouched
    await expect(readWorkspaceCredential('ws-b')).resolves.toEqual(oauthSession);
    await expect(listWorkspaceIds()).resolves.toEqual(['ws-b']);
  });

  it('listWorkspaceCredentials and listWorkspaceIds return all entries', async () => {
    await writeWorkspaceCredential('ws-a', apiKeySession);
    await writeWorkspaceCredential('ws-b', oauthSession);

    const all = await listWorkspaceCredentials();
    expect(all).toEqual({ 'ws-a': apiKeySession, 'ws-b': oauthSession });
    await expect(listWorkspaceIds()).resolves.toEqual(['ws-a', 'ws-b']);
  });

  it('malformed JSON file is treated as empty (no throw)', async () => {
    fs.writeFileSync(getCredentialsPath(), '{not valid json', 'utf-8');
    await expect(readCredentialsStore()).resolves.toEqual({ workspaces: {} });
    await expect(listWorkspaceIds()).resolves.toEqual([]);
  });

  it('writes credentials.json with 0o600 file and 0o700 dir', async () => {
    await writeWorkspaceCredential('ws-a', apiKeySession);

    const raw = fs.readFileSync(getCredentialsPath(), 'utf-8');
    expect(raw.endsWith('\n')).toBe(true);
    expect(fs.statSync(getCredentialsPath()).mode & 0o777).toBe(0o600);
    expect(fs.statSync(path.dirname(getCredentialsPath())).mode & 0o777).toBe(0o700);
  });

  it('writeCredentialsStore preserves other workspaces (no clobber)', async () => {
    await writeWorkspaceCredential('ws-a', apiKeySession);
    await writeWorkspaceCredential('ws-b', oauthSession);

    const store = await readCredentialsStore();
    store.workspaces['ws-a'] = { apiKey: 'key-updated' };
    await writeCredentialsStore(store);

    await expect(readWorkspaceCredential('ws-a')).resolves.toEqual({ apiKey: 'key-updated' });
    await expect(readWorkspaceCredential('ws-b')).resolves.toEqual(oauthSession);
  });
});
