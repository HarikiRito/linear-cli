export interface Feature {
	label: string;
	title: string;
	desc: string;
}

export const FEATURES: Feature[] = [
	{
		label: '01',
		title: 'Issue Management',
		desc: 'Create, update, list, close, and assign Linear issues directly from the terminal — no browser required.'
	},
	{
		label: '02',
		title: 'Plain-Text Output',
		desc: '--plain emits LLM-friendly plain text with no box-drawing noise. Pipe it into any agent or script.'
	},
	{
		label: '03',
		title: 'Search & Filter',
		desc: 'Filter issues by status, assignee, label, priority, team, and more. Compose filters for precise results.'
	},
	{
		label: '04',
		title: 'Project & Milestone Tracking',
		desc: 'Track projects, milestones, and cycles with full create/read/update support alongside issue management.'
	},
	{
		label: '05',
		title: 'Inline Comments & Threads',
		desc: 'Add, list, reply to, and update issue comments and threads without leaving your terminal workflow.'
	},
	{
		label: '06',
		title: 'Flexible Authentication',
		desc: 'Supports both API key and OAuth authentication flows. Works in CI, scripts, and interactive sessions.'
	}
];
