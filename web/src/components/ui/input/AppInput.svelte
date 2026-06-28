<script lang="ts">
	import { Input } from 'src/components/ui/input/index.js';
	import { Label } from 'src/components/ui/label/index.js';
	import { cn } from 'src/utils/cn';

	// let required (not const): Svelte 5 $bindable() demands a mutable binding
	let {
		id,
		label,
		class: className,
		value = $bindable<string | number | undefined>(),
		onkeydown,
		placeholder,
		disabled = false
	}: {
		id?: string;
		label?: string;
		class?: string;
		value?: string | number;
		onkeydown?: (e: KeyboardEvent) => void;
		placeholder?: string;
		disabled?: boolean;
	} = $props();
</script>

<div class={cn('flex flex-col gap-1', className)}>
	{#if label}
		<Label for={id}>{label}</Label>
	{/if}
	<Input {id} bind:value {onkeydown} {placeholder} {disabled} />
</div>
