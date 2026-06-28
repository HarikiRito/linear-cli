import { describe, expect, it } from 'vitest';
import { FEATURES } from './features';

const EXPECTED_TITLES = [
	'Issue Management',
	'Plain-Text Output',
	'Search & Filter',
	'Project & Milestone Tracking',
	'Inline Comments & Threads',
	'Flexible Authentication'
];

describe('FEATURES data', () => {
	it('contains exactly 6 feature cards', () => {
		expect(FEATURES).toHaveLength(6);
	});

	it('card titles match the locked content exactly', () => {
		const titles = FEATURES.map((f) => f.title);
		expect(titles).toEqual(EXPECTED_TITLES);
	});

	it('each card has a non-empty label, title, and desc', () => {
		for (const feature of FEATURES) {
			expect(feature.label.trim()).not.toBe('');
			expect(feature.title.trim()).not.toBe('');
			expect(feature.desc.trim()).not.toBe('');
		}
	});
});
