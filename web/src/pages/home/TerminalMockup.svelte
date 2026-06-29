<script lang="ts">
	import { cn } from 'src/utils/cn';
	import { ISSUES, buildTableParts, type Issue } from './terminal-output';

	const TABS = [
		{ id: 'agent', label: 'Agent' },
		{ id: 'human', label: 'Human' },
	] as const;

	let view: 'agent' | 'human' = $state('agent');

	function stateColor(state: Issue['state']): string {
		if (state === 'In Progress') return 'var(--color-status-progress)';
		if (state === 'In Review') return 'var(--color-status-review)';
		return 'var(--color-dim)';
	}

	const TABLE_PARTS = buildTableParts(ISSUES);
</script>

<div class="max-w-205 mx-auto mt-14 relative">
	<!-- Glow is a sibling of the terminal box so it bleeds outside overflow-hidden -->
	<div
		class="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[960px] h-[640px] rounded-full bg-[radial-gradient(circle_at_50%_50%,color-mix(in_srgb,var(--color-accent)_16%,transparent)_0%,transparent_65%)] pointer-events-none z-0 animate-breathe motion-reduce:animate-none"
		aria-hidden="true"
	></div>

	<div class="relative z-[1] bg-surface border border-border2 rounded-xl overflow-hidden">
		<div
			class="flex items-center px-3.5 py-[10px] border-b border-border bg-[color:var(--color-terminal-bar)] justify-between gap-3"
		>
			<div class="flex gap-1.5 shrink-0" aria-hidden="true">
				<div class="w-[10px] h-[10px] rounded-full bg-[#ff5f56]"></div>
				<div class="w-[10px] h-[10px] rounded-full bg-[#ffbd2e]"></div>
				<div class="w-[10px] h-[10px] rounded-full bg-[#27c93f]"></div>
			</div>

			<div class="flex gap-0.5 bg-[color:var(--color-surface3)] rounded-md p-0.5">
				{#each TABS as tab}
					<button
						onclick={() => (view = tab.id)}
						class={cn(
							'px-3 py-0.5 rounded text-[11px] font-mono transition-colors',
							view === tab.id ? 'bg-[color:var(--color-accent)] text-white' : 'text-dim hover:text-muted'
						)}
					>{tab.label}</button>
				{/each}
			</div>

			<span class="font-mono text-[10px] text-dim tracking-[0.05em] shrink-0"
				>linear · {view === 'agent' ? '--plain mode' : 'table mode'}</span
			>
		</div>

		<div
			class="py-[22px] px-6 font-mono text-[13.5px] leading-[1.85] text-text text-left overflow-x-auto max-[500px]:text-[12px] max-[500px]:p-4"
		>
			{#if view === 'agent'}
				<div><span class="text-accent">$</span>{' '}<span class="text-text">linear issues list --plain</span></div>
				{#each ISSUES as issue, i}
					<div class="text-muted mt-1">
						<span class="block">Issue: <span class="text-text">{issue.id}</span></span>
						<span class="block">title: {issue.title}</span>
						<span class="block">state: <span style="color: {stateColor(issue.state)}">{issue.state}</span></span>
						<span class="block">priority: {issue.priority}</span>
						<span class="block">assignee: {issue.assignee}</span>
					</div>
					{#if i < ISSUES.length - 1}
						<div class="text-dim">---</div>
					{/if}
				{/each}
				<div class="h-3"></div>
				<div>
					<span class="text-accent">$</span>{' '}<span class="text-text">linear issues create --title "Patch auth" --team ENG --plain</span>
				</div>
				<div class="text-muted mt-1">
					<span class="block">Issue: ENG-142</span>
					<span class="block">id: 9f3c1a2b-...</span>
					<span class="block">title: Patch auth</span>
					<span class="block">state: Backlog</span>
					<span class="block">url: https://linear.app/eng/issue/ENG-142</span>
				</div>
			{:else}
				<div><span class="text-accent">$</span>{' '}<span class="text-text">linear issues list</span></div>
				<pre
					class="whitespace-pre font-mono text-muted leading-[1.6] mt-2"
				>{TABLE_PARTS.top}
<span class="text-accent">{TABLE_PARTS.headerRow}</span>
{#each TABLE_PARTS.dataRows as row}{TABLE_PARTS.sep}
{row}
{/each}{TABLE_PARTS.bot}</pre>
				<div class="text-dim mt-2">Next page: --after abc123xyz</div>
			{/if}
		</div>
	</div>
</div>
