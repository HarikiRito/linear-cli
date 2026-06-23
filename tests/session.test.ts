import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';

// Test session logic using real temp files
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'linear-cli-test-'));
const sessionPath = path.join(tmpDir, 'auth.json');

function readSessionFromPath(filePath: string): unknown {
  try {
    const data = fs.readFileSync(filePath, 'utf-8');
    return JSON.parse(data);
  } catch {
    return null;
  }
}

function writeSessionToPath(filePath: string, session: object): void {
  const dir = path.dirname(filePath);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(session, null, 2), 'utf-8');
}

function deleteSessionAtPath(filePath: string): void {
  try {
    fs.unlinkSync(filePath);
  } catch {
    // ignore
  }
}

describe('Session file storage', () => {
  beforeEach(() => {
    try {
      fs.unlinkSync(sessionPath);
    } catch {
      /* ignore */
    }
  });

  it('returns null when auth.json does not exist', () => {
    expect(readSessionFromPath(sessionPath)).toBeNull();
  });

  it('returns session data when auth.json exists', () => {
    writeSessionToPath(sessionPath, { apiKey: 'stored-key' });
    expect(readSessionFromPath(sessionPath)).toEqual({ apiKey: 'stored-key' });
  });

  it('writes JSON to file with correct content', () => {
    writeSessionToPath(sessionPath, { apiKey: 'test-key' });
    const raw = fs.readFileSync(sessionPath, 'utf-8');
    expect(JSON.parse(raw)).toEqual({ apiKey: 'test-key' });
  });

  it('deletes file on logout', () => {
    writeSessionToPath(sessionPath, { apiKey: 'test-key' });
    deleteSessionAtPath(sessionPath);
    expect(fs.existsSync(sessionPath)).toBe(false);
  });

  it('delete does not throw when file does not exist', () => {
    expect(() => deleteSessionAtPath(sessionPath)).not.toThrow();
  });

  it('OAuth session round-trips correctly', () => {
    const session = { accessToken: 'tok', refreshToken: 'ref', expiresAt: 1234567890 };
    writeSessionToPath(sessionPath, session);
    expect(readSessionFromPath(sessionPath)).toEqual(session);
  });
});
