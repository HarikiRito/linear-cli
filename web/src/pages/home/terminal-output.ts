export type IssueState = 'In Progress' | 'Todo' | 'In Review';

export type Issue = {
	id: string;
	title: string;
	state: IssueState;
	priority: number;
	assignee: string;
};

export const ISSUES: Issue[] = [
	{ id: 'ENG-128', title: 'Fix token refresh race', state: 'In Progress', priority: 1, assignee: 'Jane Smith' },
	{ id: 'ENG-131', title: 'Paginate issues query results', state: 'Todo', priority: 0, assignee: 'Bob Lee' },
	{ id: 'ENG-140', title: 'Cache team lookups', state: 'In Review', priority: 2, assignee: 'Alice Chen' },
];

export function buildTableParts(issues: Issue[]) {
	const pad = (s: string, n: number) => s.slice(0, n).padEnd(n);
	const idW = 7, titleW = 29, stateW = 11, assigneeW = 10;
	const h = (n: number) => '─'.repeat(n);
	const top = `┌${h(idW + 2)}┬${h(titleW + 2)}┬${h(stateW + 2)}┬${h(assigneeW + 2)}┐`;
	const sep = `├${h(idW + 2)}┼${h(titleW + 2)}┼${h(stateW + 2)}┼${h(assigneeW + 2)}┤`;
	const bot = `└${h(idW + 2)}┴${h(titleW + 2)}┴${h(stateW + 2)}┴${h(assigneeW + 2)}┘`;
	const row = (id: string, title: string, st: string, assignee: string) =>
		`│ ${pad(id, idW)} │ ${pad(title, titleW)} │ ${pad(st, stateW)} │ ${pad(assignee, assigneeW)} │`;
	const headerRow = row('ID', 'Title', 'State', 'Assignee');
	const dataRows = issues.map((i) => row(i.id, i.title, i.state, i.assignee));
	return { top, sep, bot, headerRow, dataRows };
}

