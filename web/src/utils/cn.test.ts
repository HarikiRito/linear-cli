import { describe, expect, it } from 'vitest';
import { cn } from './cn';

describe('cn()', () => {
	it('merges class strings', () => {
		expect(cn('px-2', 'py-1')).toBe('px-2 py-1');
	});

	it('deduplicates conflicting tailwind classes (TC-2)', () => {
		const condition = true;
		const result = cn('px-2 py-1', condition && 'font-bold', 'px-4');
		expect(result).toBe('py-1 font-bold px-4');
	});

	it('handles falsy values from conditional classes', () => {
		const result = cn('px-2', false && 'hidden', undefined, null, 'py-4');
		expect(result).toBe('px-2 py-4');
	});

	it('handles empty inputs', () => {
		expect(cn()).toBe('');
		expect(cn('')).toBe('');
	});

	it('handles arrays of classes', () => {
		const result = cn(['px-2', 'py-1'], 'font-bold');
		expect(result).toBe('px-2 py-1 font-bold');
	});
});
