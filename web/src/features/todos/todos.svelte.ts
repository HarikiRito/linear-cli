import { err, ok, type Result } from 'src/utils/result';

export interface Todo {
	id: string;
	text: string;
	done: boolean;
}

export type TodosError = 'EMPTY_TEXT';

export function createTodosStore(initial: Todo[] = []) {
	let todos = $state<Todo[]>(initial);

	const remaining = $derived(todos.filter((t) => !t.done).length);
	const completed = $derived(todos.length - remaining);

	function add(text: string): Result<Todo, TodosError> {
		const trimmed = text.trim();
		if (!trimmed) return err('EMPTY_TEXT');
		const todo: Todo = { id: crypto.randomUUID(), text: trimmed, done: false };
		todos = [...todos, todo];
		return ok(todo);
	}

	function toggle(id: string): Result<void, never> {
		todos = todos.map((t) => (t.id === id ? { ...t, done: !t.done } : t));
		return ok(undefined);
	}

	function remove(id: string): Result<void, never> {
		todos = todos.filter((t) => t.id !== id);
		return ok(undefined);
	}

	function clear(): Result<void, never> {
		todos = [];
		return ok(undefined);
	}

	return {
		get todos() {
			return todos;
		},
		get remaining() {
			return remaining;
		},
		get completed() {
			return completed;
		},
		add,
		toggle,
		remove,
		clear
	};
}
