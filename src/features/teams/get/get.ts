import { ResultAsync } from 'neverthrow';
import { resolveTeam } from '../../../features/issues/shared/resolve.js';
import { getClientWithAuthRetry } from '../../../lib/client/index.js';
import { coerceCliError, NotFoundError } from '../../../lib/errors.js';
import type { PlainField } from '../../../lib/output/plain.js';
import { renderPlainRecord } from '../../../lib/output/plain.js';
import { prettyTable, printTable } from '../../../lib/output/table.js';
import { exitError } from '../../../lib/runner.js';

export interface GetTeamOptions {
  apiKey?: string;
  token?: string;
  id: string;
  plain: boolean;
}

interface TeamDetail {
  id: string;
  name: string;
  key: string;
  description: string | null;
  timezone: string;
  memberCount: number;
}

export async function getTeam(opts: GetTeamOptions): Promise<void> {
  const clientResult = await getClientWithAuthRetry({ apiKey: opts.apiKey, token: opts.token });
  if (clientResult.isErr()) {
    exitError(clientResult.error);
    return;
  }
  const client = clientResult.value;

  // Resolve the team id (supports both name and UUID)
  const resolvedResult = await resolveTeam(opts.id, client);
  if (resolvedResult.isErr()) {
    exitError(resolvedResult.error);
    return;
  }
  const teamId = resolvedResult.value;

  const result = await ResultAsync.fromPromise(
    (async (): Promise<TeamDetail> => {
      const team = await client.team(teamId);
      if (!team) throw new NotFoundError('team', opts.id);
      const membersConn = await team.members({ first: 1 });
      let memberCount: number;
      if (membersConn.nodes.length === 0 && !membersConn.pageInfo.hasNextPage) {
        memberCount = 0;
      } else if (membersConn.pageInfo.hasNextPage) {
        memberCount = -1; // more than 1, rendered as "many"
      } else {
        memberCount = membersConn.nodes.length;
      }
      return {
        id: team.id,
        name: team.name,
        key: team.key,
        description: team.description ?? null,
        timezone: team.timezone,
        memberCount,
      };
    })(),
    coerceCliError
  );

  result.match(
    (team) => renderTeamDetail(team, opts.plain),
    (e) => exitError(e)
  );
}

function renderTeamDetail(team: TeamDetail, plain: boolean): void {
  if (plain) {
    const fields: PlainField[] = [
      { key: 'key', value: team.key },
      { key: 'description', value: team.description },
      { key: 'timezone', value: team.timezone },
      { key: 'members', value: team.memberCount >= 0 ? String(team.memberCount) : '(many)' },
    ];
    console.log(renderPlainRecord('Team', team.name, fields));
    return;
  }

  const rows: [string, string][] = [
    ['Name', team.name],
    ['Key', team.key],
    ['Description', team.description ?? ''],
    ['Timezone', team.timezone],
    ['Members', team.memberCount >= 0 ? String(team.memberCount) : '(many)'],
  ];

  printTable(prettyTable(['Field', 'Value'], rows));
}
