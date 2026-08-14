import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { useTmpProjectAndHome } from '../../../../../tests/helpers/tmp-env.js';
import { linkProject } from '../../../keepalive/registry.js';

/**
 * Default-team resolution is link-only:
 * LINEAR_TEAM_ID env → linked registry entry team → null.
 * The global config `team` table is no longer read.
 */
describe('default team resolution (link-only)', () => {
  const tmpEnv = useTmpProjectAndHome({
    projectPrefix: 'linear-default-team-',
    homePrefix: 'linear-default-team-home-',
    deleteEnvVars: ['LINEAR_TEAM_ID', 'LINEAR_WORKSPACE'],
  });

  function writeGlobalConfig(teamToml: string): void {
    const linearDir = path.join(tmpEnv.homeDir, '.config', '.linear');
    fs.mkdirSync(linearDir, { recursive: true });
    fs.writeFileSync(path.join(linearDir, 'config.toml'), teamToml, 'utf-8');
  }

  it('ignores the global config [team] table when unlinked (returns null)', async () => {
    writeGlobalConfig('[team]\nid = "CFGTEAM"\nkey = "CT"\n');

    const { getDefaultTeamId, resolveDefaultTeam } = await import('../resolve.js');
    expect(resolveDefaultTeam()).toBeNull();
    expect(getDefaultTeamId()).toBeNull();
  });

  it('uses the linked registry entry team when unenv-var set', async () => {
    await linkProject(tmpEnv.projectDir, 'ws-1', { id: 'team-1', key: 'ENG' });
    process.cwd = () => tmpEnv.projectDir;

    const { getDefaultTeamId, resolveDefaultTeam } = await import('../resolve.js');
    expect(resolveDefaultTeam()).toEqual({ id: 'team-1', key: 'ENG' });
    expect(getDefaultTeamId()).toBe('team-1');
  });

  it('LINEAR_TEAM_ID env wins over the linked registry team', async () => {
    await linkProject(tmpEnv.projectDir, 'ws-1', { id: 'team-1', key: 'ENG' });
    process.cwd = () => tmpEnv.projectDir;
    process.env.LINEAR_TEAM_ID = 'env-team';

    const { getDefaultTeamId } = await import('../resolve.js');
    expect(getDefaultTeamId()).toBe('env-team');
  });

  it('returns null with no env and no link, even with a global config [team]', async () => {
    writeGlobalConfig('[team]\nid = "CFGTEAM"\nkey = "CT"\n');

    const { getDefaultTeamId } = await import('../resolve.js');
    expect(getDefaultTeamId()).toBeNull();
  });
});
