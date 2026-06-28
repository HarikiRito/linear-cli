<script lang="ts">
	import { Check, Copy } from '@lucide/svelte';
	import { copyToClipboard } from './copy-to-clipboard';
	import { INSTALL_CMD } from './constants';

	let copied = $state(false);
	let timer: ReturnType<typeof setTimeout> | null = null;
	let destroyed = false;

	function clearTimer() {
		if (timer !== null) {
			clearTimeout(timer);
			timer = null;
		}
	}

	$effect(() => {
		return () => {
			destroyed = true;
			clearTimer();
		};
	});

	async function handleCopy() {
		const ok = await copyToClipboard(INSTALL_CMD);
		if (!ok || destroyed) return;
		copied = true;
		clearTimer();
		timer = setTimeout(() => {
			copied = false;
			timer = null;
		}, 2000);
	}
</script>

<div
	class="inline-flex items-center gap-3 bg-surface border border-border2 rounded-[10px] py-[10px] pr-[14px] pl-[18px] font-mono text-[14px] text-text max-w-full max-[500px]:w-full"
>
	<code class="font-mono whitespace-nowrap overflow-hidden text-ellipsis">
		<span class="text-dim mr-[2px]">$</span>
		{INSTALL_CMD}
	</code>
	<button
		class="flex-shrink-0 flex items-center justify-center size-7 rounded-md border bg-surface2 cursor-pointer transition-colors {copied
			? 'text-success border-[color-mix(in_srgb,var(--color-success)_30%,transparent)]'
			: 'border-border2 text-muted hover:text-text hover:bg-surface3'}"
		onclick={handleCopy}
		title={copied ? 'Copied!' : 'Copy install command'}
		aria-label={copied ? 'Copied!' : 'Copy install command'}
	>
		{#if copied}
			<Check size={12} />
		{:else}
			<Copy size={12} />
		{/if}
	</button>
</div>
