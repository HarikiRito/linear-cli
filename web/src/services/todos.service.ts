import type { Todo } from 'src/features/todos/todos.svelte';
import { err, fromThrowable, ok, type Result } from 'src/utils/result';

const KEY = 'todos';

export type StorageError = 'PARSE_ERROR' | 'WRITE_ERROR';

const safeJsonParse = fromThrowable(
	JSON.parse as (t: string) => unknown,
	() => 'PARSE_ERROR' as const
);

const safeSetItem = fromThrowable(
	(todos: Todo[]) => localStorage.setItem(KEY, JSON.stringify(todos)),
	() => 'WRITE_ERROR' as const
);

export const TodosService = {
	load(): Result<Todo[], StorageError> {
		const raw = localStorage.getItem(KEY);
		if (!raw) return ok([]);
		return safeJsonParse(raw).andThen((parsed) =>
			Array.isArray(parsed) ? ok(parsed as Todo[]) : err('PARSE_ERROR' as const)
		);
	},

	save(todos: Todo[]): Result<void, StorageError> {
		return safeSetItem(todos);
	}
};
