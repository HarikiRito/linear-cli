<script lang="ts">
	import type { HTMLAttributes } from 'svelte/elements';
	let { class: className, ...rest }: HTMLAttributes<SVGElement> = $props();
</script>

<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"
	fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"
	stroke-linejoin="round" class={className} {...rest}>
	<circle cx="12" cy="12" r="10"/><path d="m9 12 2 2 4-4"/>
</svg>
