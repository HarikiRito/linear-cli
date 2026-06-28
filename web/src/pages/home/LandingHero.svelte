<script lang="ts">
	import { PACKAGE_NAME } from './constants';
	import InstallBlock from './InstallBlock.svelte';
	import TerminalMockup from './TerminalMockup.svelte';
</script>

<section
	class="text-center pt-[clamp(72px,10vw,120px)] pb-[clamp(56px,8vw,96px)] px-6 max-w-[1100px] mx-auto"
>
	<span class="font-mono text-[clamp(11px,1.5vw,13px)] text-dim mb-5 block">
		<span class="text-accent">~</span>
		{PACKAGE_NAME}
	</span>

	<h1
		class="font-mono text-[clamp(36px,5.5vw,64px)] font-medium tracking-[-0.03em] leading-[1.08] text-text mb-5"
	>
		The Linear CLI<br />
		built for <span class="text-accent">agents</span>.<span
			class="inline-block w-[3px] h-[0.85em] bg-accent ml-1 align-middle animate-blink motion-reduce:animate-none"
			aria-hidden="true"
		></span>
	</h1>

	<p class="text-[clamp(16px,2vw,19px)] text-muted max-w-[560px] mx-auto mb-10 leading-[1.65]">
		A CLI for Linear designed for agent/programmatic use. Outputs boxed tables for humans and an
		agent-friendly plain-text (--plain) format optimized for AI tooling and scripting.
	</p>

	<div class="mb-4">
		<InstallBlock />
	</div>

	<TerminalMockup />
</section>
