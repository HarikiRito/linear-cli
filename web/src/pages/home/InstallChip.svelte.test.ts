import { mount, unmount } from 'svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import InstallChip from './InstallChip.svelte';

// Drain microtasks so async handlers settle before assertions.
async function flush(rounds = 4): Promise<void> {
	for (let i = 0; i < rounds; i++) {
		await Promise.resolve();
	}
}

describe('InstallChip', () => {
	let target: HTMLElement;

	beforeEach(() => {
		target = document.createElement('div');
		document.body.appendChild(target);
	});

	afterEach(() => {
		document.body.removeChild(target);
		vi.restoreAllMocks();
	});

	function stubClipboard(resolves: boolean) {
		const writeText = resolves
			? vi.fn().mockResolvedValue(undefined)
			: vi.fn().mockRejectedValue(new Error('denied'));
		Object.defineProperty(navigator, 'clipboard', {
			value: { writeText },
			writable: true,
			configurable: true
		});
		return writeText;
	}

	function getButton(el: HTMLElement): HTMLButtonElement {
		const btn = el.querySelector<HTMLButtonElement>('button');
		if (!btn) throw new Error('copy button not found');
		return btn;
	}

	it('(a) clicking copy calls clipboard and shows Check icon (Copied! label)', async () => {
		const writeText = stubClipboard(true);
		mount(InstallChip, { target });

		const btn = getButton(target);
		btn.click();
		await flush();

		expect(writeText).toHaveBeenCalledWith('npm i -g @harikidev/linear-cli');
		expect(btn.getAttribute('aria-label')).toBe('Copied!');
		expect(btn.getAttribute('title')).toBe('Copied!');
	});

	it('(b) copied state resets to false after the 2-second timeout', async () => {
		vi.useFakeTimers();
		stubClipboard(true);
		mount(InstallChip, { target });

		const btn = getButton(target);
		btn.click();
		// Advance microtasks so the resolved clipboard promise settles
		await flush();

		// copied should now be true
		expect(btn.getAttribute('aria-label')).toBe('Copied!');

		// Advance past the 2000 ms reset timer then flush Svelte updates
		vi.advanceTimersByTime(2001);
		await flush();

		expect(btn.getAttribute('aria-label')).toBe('Copy install command');

		vi.useRealTimers();
	});

	it('(c) timer is cleared on unmount — no state update after destroy', async () => {
		vi.useFakeTimers();
		stubClipboard(true);
		const component = mount(InstallChip, { target });

		const btn = getButton(target);
		btn.click();
		await flush(); // let handleCopy settle → timer created

		// aria-label should be Copied! now
		expect(btn.getAttribute('aria-label')).toBe('Copied!');

		// Unmount BEFORE the 2000 ms reset timer fires
		await unmount(component);

		// Advancing the timer must not throw (no state update on destroyed component)
		expect(() => vi.advanceTimersByTime(3000)).not.toThrow();

		vi.useRealTimers();
	});

	it('does not toggle to copied state when clipboard is rejected', async () => {
		stubClipboard(false);
		mount(InstallChip, { target });

		const btn = getButton(target);
		btn.click();
		await flush();

		expect(btn.getAttribute('aria-label')).toBe('Copy install command');
	});
});
