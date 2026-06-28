<script lang="ts">
	import { Card, CardContent, CardHeader, CardTitle, CardDescription } from 'src/components/ui/card/index.js';
	import { cn } from 'src/utils/cn';
	import type { HTMLAttributes } from 'svelte/elements';

	const { class: className, title, description, children, ...rest }: HTMLAttributes<HTMLDivElement> & {
		title?: string;
		description?: string;
	} = $props();
</script>

<Card class={cn(className)} {...rest}>
	{#if title || description}
		<CardHeader>
			{#if title}
				<CardTitle>{title}</CardTitle>
			{/if}
			{#if description}
				<CardDescription>{description}</CardDescription>
			{/if}
		</CardHeader>
	{/if}
	<CardContent>
		{@render children?.()}
	</CardContent>
</Card>
