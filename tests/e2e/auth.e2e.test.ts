/**
 * E2E tests: auth / whoami
 *
 * Does NOT run `login` or `logout` — those would destroy the real session.
 * Unauthenticated behavior is tested by passing an obviously-invalid --token
 * override (never touches the stored session).
 *
 * All assertions are shape-only — no workspace name, user name, or email are
 * hardcoded. We assert that the fields are present, non-empty, and well-formed.
 *
 * Gate: RUN_E2E=1
 */

import { describe, expect, it } from 'vitest';
import { CMD_TIMEOUT, parsePlainList, parsePlainRecord, RUN_E2E, runCLI } from './helpers.js';

describe.skipIf(!RUN_E2E)('auth E2E', () => {
  // ── whoami --plain ───────────────────────────────────────────────────────

  it(
    'whoami --plain returns non-empty id, name, email, workspace (shape only)',
    async () => {
      const r = await runCLI(['whoami', '--plain']);
      expect(r.code, `stderr: ${r.stderr}`).toBe(0);
      const data = parsePlainRecord(r.stdout);
      expect(typeof data['id']).toBe('string');
      expect(data['id']).not.toBe('');
      expect(typeof data['_primaryId']).toBe('string');  // name
      expect(data['_primaryId']).not.toBe('');
      expect(typeof data['email']).toBe('string');
      expect(data['email']).toContain('@');
      expect(typeof data['workspace']).toBe('string');
      expect(data['workspace']).not.toBe('');
    },
    CMD_TIMEOUT
  );

  // ── Stored session works for a data command ──────────────────────────────

  it(
    'teams list succeeds with stored session (no explicit --token)',
    async () => {
      const r = await runCLI(['teams', 'list', '--plain']);
      expect(r.code, `stderr: ${r.stderr}`).toBe(0);
      const records = parsePlainList(r.stdout);
      expect(records.length).toBeGreaterThan(0);
    },
    CMD_TIMEOUT
  );

  // ── Unauthenticated path (invalid --token override, never touches session) ──

  it(
    'whoami with invalid --token exits non-zero with auth error',
    async () => {
      const r = await runCLI(['whoami', '--token', 'lin_invalid_token_e2e_test', '--plain']);
      expect(r.code).not.toBe(0);
      expect(r.stderr + r.stdout).toMatch(/auth|unauthorized|invalid|token|forbidden/i);
    },
    CMD_TIMEOUT
  );
});
