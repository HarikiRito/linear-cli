import { describe, expect, it } from 'vitest';
import { createCounterStore } from './counter.svelte';

describe('createCounterStore', () => {
	it('starts at 0 by default', () => {
		const store = createCounterStore();
		expect(store.count).toBe(0);
		expect(store.doubled).toBe(0);
	});

	it('starts at specified initial value', () => {
		const store = createCounterStore(5);
		expect(store.count).toBe(5);
		expect(store.doubled).toBe(10);
	});

	it('increment() increases count and returns ok(count)', () => {
		const store = createCounterStore();
		const result = store.increment();
		expect(result.isOk()).toBe(true);
		expect(store.count).toBe(1);
		expect(store.doubled).toBe(2);
		if (result.isOk()) {
			expect(result.value).toBe(1);
		}
	});

	it('decrement() decreases count and returns ok(count)', () => {
		const store = createCounterStore();
		store.increment();
		const result = store.decrement();
		expect(result.isOk()).toBe(true);
		expect(store.count).toBe(0);
		expect(store.doubled).toBe(0);
		if (result.isOk()) {
			expect(result.value).toBe(0);
		}
	});

	it('reset() returns to initial value and returns ok(void)', () => {
		const store = createCounterStore(3);
		store.increment();
		store.increment();
		expect(store.count).toBe(5);
		const result = store.reset();
		expect(result.isOk()).toBe(true);
		expect(store.count).toBe(3);
		expect(store.doubled).toBe(6);
	});

	it('doubled always equals count * 2', () => {
		const store = createCounterStore();
		store.increment();
		store.increment();
		expect(store.count).toBe(2);
		expect(store.doubled).toBe(4);
		store.decrement();
		expect(store.count).toBe(1);
		expect(store.doubled).toBe(2);
		store.reset();
		expect(store.count).toBe(0);
		expect(store.doubled).toBe(0);
	});
});
