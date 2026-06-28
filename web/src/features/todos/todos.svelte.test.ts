import { describe, expect, it } from 'vitest';
import { createTodosStore } from './todos.svelte';

describe('createTodosStore', () => {
	it('starts empty with no initial todos', () => {
		const store = createTodosStore();
		expect(store.todos.length).toBe(0);
		expect(store.remaining).toBe(0);
		expect(store.completed).toBe(0);
	});

	it('add() adds a valid todo and returns ok(todo)', () => {
		const store = createTodosStore();
		const result = store.add('Buy milk');
		expect(result.isOk()).toBe(true);
		expect(store.todos.length).toBe(1);
		expect(store.remaining).toBe(1);
		expect(store.completed).toBe(0);
		if (result.isOk()) {
			expect(result.value.text).toBe('Buy milk');
			expect(result.value.done).toBe(false);
		}
	});

	it('add() returns err(EMPTY_TEXT) for empty string without mutation', () => {
		const store = createTodosStore();
		store.add('Buy milk');
		const result = store.add('');
		expect(result.isErr()).toBe(true);
		if (result.isErr()) {
			expect(result.error).toBe('EMPTY_TEXT');
		}
		expect(store.todos.length).toBe(1);
	});

	it('add() returns err(EMPTY_TEXT) for whitespace-only string', () => {
		const store = createTodosStore();
		const result = store.add('   ');
		expect(result.isErr()).toBe(true);
		if (result.isErr()) {
			expect(result.error).toBe('EMPTY_TEXT');
		}
	});

	it('toggle() marks a todo done and updates derived counts', () => {
		const store = createTodosStore();
		const addResult = store.add('Buy milk');
		expect(addResult.isOk()).toBe(true);
		if (!addResult.isOk()) return;

		const id = addResult.value.id;
		const toggleResult = store.toggle(id);
		expect(toggleResult.isOk()).toBe(true);
		expect(store.todos[0].done).toBe(true);
		expect(store.remaining).toBe(0);
		expect(store.completed).toBe(1);
	});

	it('remove() removes a todo', () => {
		const store = createTodosStore();
		store.add('Buy milk');
		const addResult2 = store.add('Walk dog');
		expect(addResult2.isOk()).toBe(true);
		if (!addResult2.isOk()) return;

		const id2 = addResult2.value.id;
		const removeResult = store.remove(id2);
		expect(removeResult.isOk()).toBe(true);
		expect(store.todos.length).toBe(1);
		expect(store.todos[0].text).toBe('Buy milk');
	});

	it('clear() removes all todos', () => {
		const store = createTodosStore();
		store.add('Buy milk');
		store.add('Walk dog');
		const clearResult = store.clear();
		expect(clearResult.isOk()).toBe(true);
		expect(store.todos.length).toBe(0);
		expect(store.remaining).toBe(0);
		expect(store.completed).toBe(0);
	});

	it('add, toggle, remove, and clear all work together in sequence', () => {
		const store = createTodosStore();

		const r1 = store.add('Buy milk');
		expect(r1.isOk()).toBe(true);
		expect(store.todos.length).toBe(1);
		expect(store.remaining).toBe(1);
		expect(store.completed).toBe(0);

		store.add('Walk dog');
		expect(store.todos.length).toBe(2);
		expect(store.remaining).toBe(2);

		if (!r1.isOk()) return;
		store.toggle(r1.value.id);
		expect(store.todos.find((t) => t.id === r1.value.id)?.done).toBe(true);
		expect(store.remaining).toBe(1);
		expect(store.completed).toBe(1);

		const secondTodo = store.todos.find((t) => t.text === 'Walk dog');
		expect(secondTodo).toBeDefined();
		if (!secondTodo) return;
		store.remove(secondTodo.id);
		expect(store.todos.length).toBe(1);

		const errResult = store.add('');
		expect(errResult.isErr()).toBe(true);
		if (errResult.isErr()) {
			expect(errResult.error).toBe('EMPTY_TEXT');
		}
		expect(store.todos.length).toBe(1);

		store.clear();
		expect(store.todos.length).toBe(0);
		expect(store.remaining).toBe(0);
		expect(store.completed).toBe(0);
	});
});
