<script lang="ts">
	import type { HTMLAttributes } from 'svelte/elements';
	let { class: className, ...rest }: HTMLAttributes<SVGElement> = $props();
</script>

<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"
	fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"
	stroke-linejoin="round" class={className} {...rest}>
	<path d="M21 12a9 9 0 1 1-6.219-8.56"/>
</svg>
