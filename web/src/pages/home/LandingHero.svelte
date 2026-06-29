<script lang="ts">
	import { onMount } from 'svelte';
	import TypeIt from 'typeit';
	import { PACKAGE_NAME } from './constants';
	import InstallBlock from './InstallBlock.svelte';
	import TerminalMockup from './TerminalMockup.svelte';

	let el: HTMLElement | undefined = $state();

	onMount(() => {
		if (!el) return;
		let cursorEl: HTMLElement | null = null;
		const setColor = (c: string) => {
			el!.style.color = c;
			cursorEl ??= el!.querySelector('.ti-cursor');
			if (cursorEl) cursorEl.style.color = c;
		};
		const instance = (new TypeIt(el, {
			speed: 90,
			deleteSpeed: 45,
			loop: true,
			cursor: true
		}))
			.exec(() => { setColor('var(--color-accent)'); })
			.type('agents')
			.pause(1200)
			.delete()
			.pause(200)
			.exec(() => { setColor('var(--color-human)'); })
			.type('humans')
			.pause(1200)
			.delete()
			.pause(200)
			.go();
		return () => instance.destroy();
	});
</script>

<section
	class="text-center pt-[clamp(72px,10vw,120px)] pb-[clamp(56px,8vw,96px)] px-6 max-w-275 mx-auto"
>
	<span class="font-mono text-[clamp(11px,1.5vw,13px)] text-dim mb-5 block">
		<span class="text-accent">~</span>
		{PACKAGE_NAME}
	</span>

	<h1
		class="font-mono text-[clamp(36px,5.5vw,64px)] font-medium tracking-[-0.03em] leading-[1.08] text-text mb-5"
	>
		The Linear CLI<br />
		built for <span class="text-accent inline-block min-w-[1ch]" aria-hidden="true" bind:this={el}></span>.<span
			class="sr-only">agents and humans</span
		>
	</h1>

	<p class="text-[clamp(16px,2vw,19px)] text-muted max-w-140 mx-auto mb-10 leading-[1.65]">
		A CLI for Linear designed for agent/programmatic use. Outputs boxed tables for humans and a
		plain-text format optimized for AI tooling and scripting.
	</p>

	<div class="mb-4">
		<InstallBlock />
	</div>

	<TerminalMockup />
</section>
