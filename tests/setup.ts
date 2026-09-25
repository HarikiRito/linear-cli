import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll } from 'vitest';

// Isolate tests from the developer's real ~/.config/.linear registry.
const fakeHome = fs.mkdtempSync(path.join(os.tmpdir(), 'linear-cli-test-home-'));
process.env.HOME = fakeHome;
process.env.USERPROFILE = fakeHome;

afterAll(() => {
  fs.rmSync(fakeHome, { recursive: true, force: true });
});
