import type { Command } from 'commander';
import { addAuthOptions, addPlainOption, parseCsv } from '../../../lib/commandOptions.js';
import { updateIssue } from './update.js';

export function registerUpdateCommand(issues: Command): void {
  const cmd = issues
    .command('update <id>')
    .description('Update an issue')
    .option('--title <text>', 'Issue title')
    .option('--team <name-or-id>', 'Team name or ID')
    .option('--description <text>', 'Issue description (use - to read from stdin)')
    .option('--project <name-or-id>', 'Project name or ID')
    .option('--milestone <name-or-id>', 'Milestone name or ID (requires --project)')
    .option('--assignee <name-or-id>', 'Assignee name or ID')
    .option(
      '--labels <labels>',
      'Comma-separated label names or IDs (replaces all existing labels)'
    )
    .option('--state <name-or-id>', 'Workflow state name or ID (requires --team)')
    .option('--priority <0-4>', 'Priority: 0=None, 1=Urgent, 2=High, 3=Medium, 4=Low')
    .option('--estimate <number>', 'Story point estimate')
    .option('--cycle <name-or-id>', 'Cycle name or ID (requires --team)')
    .option('--parent <id>', 'Parent issue ID')
    .option('--no-parent', 'Clear the parent (set parentId to null)')
    .option('--due-date <YYYY-MM-DD>', 'Due date');

  addAuthOptions(addPlainOption(cmd)).action(
    async (
      id: string,
      opts: {
        title?: string;
        team?: string;
        description?: string;
        project?: string;
        milestone?: string;
        assignee?: string;
        labels?: string;
        state?: string;
        priority?: string;
        estimate?: string;
        cycle?: string;
        parent?: string | false;
        dueDate?: string;
        apiKey?: string;
        token?: string;
        plain?: boolean;
      }
    ) => {
      const labels = opts.labels ? parseCsv(opts.labels) : undefined;
      await updateIssue({
        apiKey: opts.apiKey,
        token: opts.token,
        id,
        title: opts.title,
        team: opts.team,
        description: opts.description,
        project: opts.project,
        milestone: opts.milestone,
        assignee: opts.assignee,
        labels,
        state: opts.state,
        priority: opts.priority !== undefined ? Number(opts.priority) : undefined,
        estimate: opts.estimate !== undefined ? Number(opts.estimate) : undefined,
        cycle: opts.cycle,
        parent: typeof opts.parent === 'string' ? opts.parent : undefined,
        noParent: opts.parent === false,
        dueDate: opts.dueDate,
        plain: !!opts.plain,
      });
    }
  );
}
