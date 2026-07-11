import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { useTmpProjectAndHome } from '../../../../../tests/helpers/tmp-env.js';

/** Build a `[[projects]]` array-of-tables TOML block from bare ids. */
function projectsToml(ids: string[]): string {
  if (ids.length === 0) return 'projects = []\n';
  return ids.map((id) => `[[projects]]\nid = "${id}"\nname = "${id}-name"\n`).join('\n');
}

describe('getDefaultProjectIds: real two-file precedence (project vs global)', () => {
  const tmpEnv = useTmpProjectAndHome({
    projectPrefix: 'linear-project-ids-project-',
    homePrefix: 'linear-project-ids-home-',
    deleteEnvVars: ['LINEAR_TEAM_ID', 'LINEAR_WORKSPACE'],
  });

  it('project config.toml projects wins when BOTH real project and global config.toml set different values', async () => {
    const globalLinearDir = path.join(tmpEnv.homeDir, '.config', '.linear');
    fs.mkdirSync(globalLinearDir, { recursive: true });
    fs.writeFileSync(path.join(globalLinearDir, 'config.toml'), projectsToml(['g1']), 'utf-8');

    const projectLinearDir = path.join(tmpEnv.projectDir, '.linear');
    fs.mkdirSync(projectLinearDir, { recursive: true });
    fs.writeFileSync(path.join(projectLinearDir, 'config.toml'), projectsToml(['p1']), 'utf-8');

    process.cwd = () => tmpEnv.projectDir;

    const { getDefaultProjectIds } = await import('../resolve.js');
    expect(getDefaultProjectIds()).toEqual(['p1']);
  });

  it('falls back to the real global config.toml projects when project config has none set', async () => {
    const globalLinearDir = path.join(tmpEnv.homeDir, '.config', '.linear');
    fs.mkdirSync(globalLinearDir, { recursive: true });
    fs.writeFileSync(path.join(globalLinearDir, 'config.toml'), projectsToml(['g1']), 'utf-8');

    process.cwd = () => tmpEnv.projectDir;

    const { getDefaultProjectIds } = await import('../resolve.js');
    expect(getDefaultProjectIds()).toEqual(['g1']);
  });

  it('falls back to global config.toml projects when project config.toml exists but has an empty projects array', async () => {
    const globalLinearDir = path.join(tmpEnv.homeDir, '.config', '.linear');
    fs.mkdirSync(globalLinearDir, { recursive: true });
    fs.writeFileSync(path.join(globalLinearDir, 'config.toml'), projectsToml(['g1']), 'utf-8');

    const projectLinearDir = path.join(tmpEnv.projectDir, '.linear');
    fs.mkdirSync(projectLinearDir, { recursive: true });
    fs.writeFileSync(path.join(projectLinearDir, 'config.toml'), 'projects = []\n', 'utf-8');

    process.cwd = () => tmpEnv.projectDir;

    const { getDefaultProjectIds } = await import('../resolve.js');
    expect(getDefaultProjectIds()).toEqual(['g1']);
  });

  it('returns undefined when neither project nor global config has projects set', async () => {
    process.cwd = () => tmpEnv.projectDir;

    const { getDefaultProjectIds } = await import('../resolve.js');
    expect(getDefaultProjectIds()).toBeUndefined();
  });

  it('returns undefined when both project and global config have an empty projects array', async () => {
    const globalLinearDir = path.join(tmpEnv.homeDir, '.config', '.linear');
    fs.mkdirSync(globalLinearDir, { recursive: true });
    fs.writeFileSync(path.join(globalLinearDir, 'config.toml'), 'projects = []\n', 'utf-8');

    const projectLinearDir = path.join(tmpEnv.projectDir, '.linear');
    fs.mkdirSync(projectLinearDir, { recursive: true });
    fs.writeFileSync(path.join(projectLinearDir, 'config.toml'), 'projects = []\n', 'utf-8');

    process.cwd = () => tmpEnv.projectDir;

    const { getDefaultProjectIds } = await import('../resolve.js');
    expect(getDefaultProjectIds()).toBeUndefined();
  });

  it('reads multiple projects and extracts bare ids in order', async () => {
    const projectLinearDir = path.join(tmpEnv.projectDir, '.linear');
    fs.mkdirSync(projectLinearDir, { recursive: true });
    fs.writeFileSync(
      path.join(projectLinearDir, 'config.toml'),
      projectsToml(['p1', 'p2']),
      'utf-8'
    );

    process.cwd = () => tmpEnv.projectDir;

    const { getDefaultProjectIds } = await import('../resolve.js');
    expect(getDefaultProjectIds()).toEqual(['p1', 'p2']);
  });
});
