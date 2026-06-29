<script lang="ts">
	import { FEATURES as features } from './features';
	import { cn } from 'src/utils/cn';
</script>

<section class="max-w-275 mx-auto mt-24 px-6">
	<div class="font-mono text-[11px] tracking-[0.1em] uppercase text-dim mb-3.5">Features</div>
	<div class="text-[clamp(24px,3vw,36px)] font-bold tracking-[-0.03em] text-text mb-12">
		Everything you need,<br />nothing you don't.
	</div>
	<div
		class="grid grid-cols-3 max-md:grid-cols-1 gap-px bg-border border border-border rounded-xl overflow-hidden"
	>
		{#each features as feature, i (feature.title)}
			<div class={cn('bg-surface p-7 flex flex-col gap-2.5 transition-all hover:bg-surface2 hover:shadow-[inset_0_0_0_1px_var(--color-accent)]', i === 0 && 'max-md:rounded-t-xl md:rounded-tl-xl', i === 2 && 'md:rounded-tr-xl', i === 3 && 'md:rounded-bl-xl', i === 5 && 'max-md:rounded-b-xl md:rounded-br-xl')}>
				<div class="font-mono text-[11px] text-accent tracking-[0.05em] uppercase mb-1">
					{feature.label}
				</div>
				<div class="text-[15px] font-semibold text-text tracking-[-0.02em]">{feature.title}</div>
				<div class="text-[14px] text-muted leading-[1.6]">{feature.desc}</div>
			</div>
		{/each}
	</div>
</section>
