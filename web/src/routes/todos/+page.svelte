<script lang="ts">
	import { toast } from 'svelte-sonner';
	import { createTodosStore } from 'src/features/todos/todos.svelte';
	import { TodosService } from 'src/services/todos.service';
	import AppButton from 'src/components/ui/button/AppButton.svelte';
	import AppCard from 'src/components/ui/card/AppCard.svelte';
	import AppInput from 'src/components/ui/input/AppInput.svelte';
	import { cn } from 'src/utils/cn';

	const initialTodos = TodosService.load().unwrapOr([]);
	const store = createTodosStore(initialTodos);

	let inputText = $state('');

	function saveOrToast() {
		TodosService.save(store.todos).mapErr(() => toast.error('Failed to save todos'));
	}

	function handleAdd() {
		const result = store.add(inputText);
		result.match(
			(_todo) => {
				inputText = '';
				saveOrToast();
			},
			(e) => {
				if (e === 'EMPTY_TEXT') toast.error('Todo text cannot be empty');
			}
		);
	}

	function handleToggle(id: string) {
		store.toggle(id).map(() => {
			saveOrToast();
		});
	}

	function handleRemove(id: string) {
		store.remove(id).map(() => {
			saveOrToast();
		});
	}

	function handleClear() {
		store.clear().map(() => {
			saveOrToast();
		});
	}

	function handleKeydown(event: KeyboardEvent) {
		if (event.key === 'Enter') handleAdd();
	}
</script>

<div class="flex flex-col gap-6">
	<div>
		<h1 class="text-3xl font-bold">Todos</h1>
		<p class="text-muted-foreground mt-1 text-sm">
			{store.remaining} remaining · {store.completed} completed
		</p>
	</div>

	<AppCard>
		<div class="flex gap-2">
			<AppInput
				id="todo-input"
				placeholder="What needs to be done?"
				bind:value={inputText}
				onkeydown={handleKeydown}
				class="flex-1"
			/>
			<AppButton onclick={handleAdd}>Add</AppButton>
		</div>
	</AppCard>

	{#if store.todos.length > 0}
		<AppCard>
			<ul class="divide-y">
				{#each store.todos as todo (todo.id)}
					<li class="flex items-center gap-3 py-3">
						<input
							type="checkbox"
							checked={todo.done}
							onchange={() => handleToggle(todo.id)}
							class="h-4 w-4 rounded border-gray-300"
							aria-label={`Mark "${todo.text}" as ${todo.done ? 'incomplete' : 'complete'}`}
						/>
						<span class={cn('flex-1 text-sm', todo.done && 'text-muted-foreground line-through')}>
							{todo.text}
						</span>
						<AppButton variant="ghost" onclick={() => handleRemove(todo.id)} class="h-8 px-2 text-xs">
							Remove
						</AppButton>
					</li>
				{/each}
			</ul>
		</AppCard>

		<div class="flex justify-end">
			<AppButton variant="outline" onclick={handleClear}>Clear all</AppButton>
		</div>
	{:else}
		<p class="text-muted-foreground text-center text-sm">No todos yet. Add one above!</p>
	{/if}
</div>
