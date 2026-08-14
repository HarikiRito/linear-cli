import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { useTmpProjectAndHome } from '../../../../../tests/helpers/tmp-env.js';

/** Build a `[[projects]]` array-of-tables TOML block from bare ids. */
function projectsToml(ids: string[]): string {
  if (ids.length === 0) return 'projects = []\n';
  return ids.map((id) => `[[projects]]\nid = "${id}"\nname = "${id}-name"\n`).join('\n');
}

function writeGlobalConfig(homeDir: string, content: string): void {
  const globalLinearDir = path.join(homeDir, '.config', '.linear');
  fs.mkdirSync(globalLinearDir, { recursive: true });
  fs.writeFileSync(path.join(globalLinearDir, 'config.toml'), content, 'utf-8');
}

describe('getDefaultProjectIds: global config precedence', () => {
  const tmpEnv = useTmpProjectAndHome({
    projectPrefix: 'linear-project-ids-project-',
    homePrefix: 'linear-project-ids-home-',
    deleteEnvVars: ['LINEAR_TEAM_ID', 'LINEAR_WORKSPACE'],
  });

  it('returns ids from the global config.toml projects table', async () => {
    writeGlobalConfig(tmpEnv.homeDir, projectsToml(['g1', 'g2']));

    const { getDefaultProjectIds } = await import('../resolve.js');
    expect(getDefaultProjectIds()).toEqual(['g1', 'g2']);
  });

  it('returns undefined when the global config has no projects set', async () => {
    const { getDefaultProjectIds } = await import('../resolve.js');
    expect(getDefaultProjectIds()).toBeUndefined();
  });

  it('returns undefined when the global config has an empty projects array', async () => {
    writeGlobalConfig(tmpEnv.homeDir, 'projects = []\n');

    const { getDefaultProjectIds } = await import('../resolve.js');
    expect(getDefaultProjectIds()).toBeUndefined();
  });

  it('reads multiple projects and extracts bare ids in order', async () => {
    writeGlobalConfig(tmpEnv.homeDir, projectsToml(['p1', 'p2']));

    const { getDefaultProjectIds } = await import('../resolve.js');
    expect(getDefaultProjectIds()).toEqual(['p1', 'p2']);
  });
});
