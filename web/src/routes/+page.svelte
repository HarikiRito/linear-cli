<script lang="ts">
	import AppButton from 'src/components/ui/button/AppButton.svelte';
	import AppCard from 'src/components/ui/card/AppCard.svelte';
</script>

<div class="flex flex-col gap-6">
	<div class="text-center">
		<h1 class="text-4xl font-bold tracking-tight">SvelteKit Base Template</h1>
		<p class="text-muted-foreground mt-2 text-lg">
			A lean SvelteKit SPA template with Svelte 5 runes, shadcn-svelte, neverthrow, and Tailwind v4.
		</p>
	</div>

	<AppCard title="Features" description="What's included in this template">
		<ul class="list-inside list-disc space-y-1 text-sm">
			<li>Svelte 5 runes-based feature stores</li>
			<li>shadcn-svelte components with App* wrappers</li>
			<li>neverthrow for type-safe error handling (no try-catch)</li>
			<li>Tailwind CSS v4 (CSS-first, no config file)</li>
			<li>SPA mode via adapter-static</li>
			<li>Hybrid lint: Biome (TS/JS) + ESLint/Prettier (Svelte)</li>
		</ul>
	</AppCard>

	<div class="flex justify-center">
		<AppButton href="/todos">View Todos Demo</AppButton>
	</div>
</div>
