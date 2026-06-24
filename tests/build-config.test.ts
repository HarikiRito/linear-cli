import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

describe('tsdown config', () => {
  it('has minify enabled', () => {
    const config = fs.readFileSync(path.resolve(__dirname, '../tsdown.config.mts'), 'utf8');
    expect(config).toContain('minify: true');
  });

  it('has comments stripped in output options', () => {
    const config = fs.readFileSync(path.resolve(__dirname, '../tsdown.config.mts'), 'utf8');
    expect(config).toContain('comments: false');
  });
});
