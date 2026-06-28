<script lang="ts">
	import 'src/app.css';
	import AppSonner from 'src/components/ui/sonner/AppSonner.svelte';

	const { children } = $props();
</script>

<nav class="border-b px-4 py-3">
	<ul class="flex gap-4">
		<li><a class="font-semibold hover:underline" href="/">Home</a></li>
		<li><a class="font-semibold hover:underline" href="/todos">Todos</a></li>
	</ul>
</nav>

<main class="mx-auto max-w-3xl px-4 py-8">
	{@render children()}
</main>

<AppSonner />
