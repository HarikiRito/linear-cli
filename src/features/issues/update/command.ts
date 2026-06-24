import type { Command } from 'commander';
import { addAuthOptions } from '../../../lib/commandOptions.js';
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
    .option('--labels <labels>', 'Comma-separated label names or IDs (replaces all existing labels)')
    .option('--state <name-or-id>', 'Workflow state name or ID (requires --team)')
    .option('--priority <0-4>', 'Priority: 0=None, 1=Urgent, 2=High, 3=Medium, 4=Low')
    .option('--estimate <number>', 'Story point estimate')
    .option('--cycle <name-or-id>', 'Cycle name or ID (requires --team)')
    .option('--parent <id>', 'Parent issue ID')
    .option('--due-date <YYYY-MM-DD>', 'Due date')
    .option('--json', 'Output as JSON');

  addAuthOptions(cmd).action(
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
        parent?: string;
        dueDate?: string;
        apiKey?: string;
        token?: string;
        json?: boolean;
      }
    ) => {
      const labels = opts.labels
        ? opts.labels
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean)
        : undefined;
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
        parent: opts.parent,
        dueDate: opts.dueDate,
        json: !!opts.json,
      });
    }
  );
}
