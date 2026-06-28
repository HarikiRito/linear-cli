import { ok, type Result } from 'src/utils/result';

export function createCounterStore(initial = 0) {
	let count = $state(initial);
	const doubled = $derived(count * 2);

	function increment(): Result<number, never> {
		count += 1;
		return ok(count);
	}

	function decrement(): Result<number, never> {
		count -= 1;
		return ok(count);
	}

	function reset(): Result<void, never> {
		count = initial;
		return ok(undefined);
	}

	return {
		get count() {
			return count;
		},
		get doubled() {
			return doubled;
		},
		increment,
		decrement,
		reset
	};
}
