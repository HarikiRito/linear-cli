import { describe, expect, it } from 'vitest';
import { ISSUES, buildTableParts } from './terminal-output';

describe('buildTableParts()', () => {
	it('returns box-drawing border rows', () => {
		const { top, bot } = buildTableParts(ISSUES);
		expect(top).toContain('┌');
		expect(top).toContain('┐');
		expect(bot).toContain('└');
		expect(bot).toContain('┘');
	});

	it('headerRow contains ID, Title, State, Assignee', () => {
		const { headerRow } = buildTableParts(ISSUES);
		expect(headerRow).toContain('ID');
		expect(headerRow).toContain('Title');
		expect(headerRow).toContain('State');
		expect(headerRow).toContain('Assignee');
	});

	it('dataRows contains each issue ID', () => {
		const { dataRows } = buildTableParts(ISSUES);
		const joined = dataRows.join('\n');
		for (const issue of ISSUES) {
			expect(joined).toContain(issue.id);
		}
	});

	it('pad truncates long titles to fit column width', () => {
		const longTitle = 'A'.repeat(50);
		const { dataRows } = buildTableParts([{ id: 'T-1', title: longTitle, state: 'Todo', priority: 0, assignee: 'X' }]);
		// titleW is 29; the row should not contain more than 29 A's
		const match = dataRows[0].match(/A+/);
		expect(match![0].length).toBeLessThanOrEqual(29);
	});
});
