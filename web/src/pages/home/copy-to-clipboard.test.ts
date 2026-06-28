import { afterEach, describe, expect, it, vi } from 'vitest';
import { copyToClipboard } from './copy-to-clipboard';

describe('copyToClipboard()', () => {
	const originalNavigator = globalThis.navigator;

	afterEach(() => {
		Object.defineProperty(globalThis, 'navigator', {
			value: originalNavigator,
			writable: true,
			configurable: true
		});
		vi.restoreAllMocks();
	});

	it('returns true and writes text on success', async () => {
		const writeText = vi.fn().mockResolvedValue(undefined);
		Object.defineProperty(globalThis, 'navigator', {
			value: { clipboard: { writeText } },
			writable: true,
			configurable: true
		});

		const result = await copyToClipboard('npm i -g @harikidev/linear-cli');

		expect(result).toBe(true);
		expect(writeText).toHaveBeenCalledWith('npm i -g @harikidev/linear-cli');
	});

	it('returns false and does not throw on clipboard rejection', async () => {
		const writeText = vi.fn().mockRejectedValue(new Error('NotAllowedError'));
		Object.defineProperty(globalThis, 'navigator', {
			value: { clipboard: { writeText } },
			writable: true,
			configurable: true
		});

		const result = await copyToClipboard('npm i -g @harikidev/linear-cli');

		expect(result).toBe(false);
	});

	it('returns false when navigator.clipboard is undefined', async () => {
		Object.defineProperty(globalThis, 'navigator', {
			value: {},
			writable: true,
			configurable: true
		});

		const result = await copyToClipboard('npm i -g @harikidev/linear-cli');

		expect(result).toBe(false);
	});

	it('returns false when navigator is undefined', async () => {
		Object.defineProperty(globalThis, 'navigator', {
			value: undefined,
			writable: true,
			configurable: true
		});

		const result = await copyToClipboard('npm i -g @harikidev/linear-cli');

		expect(result).toBe(false);
	});
});
