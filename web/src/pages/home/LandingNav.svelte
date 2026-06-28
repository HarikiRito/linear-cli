<script lang="ts">
	import { GITHUB_URL, NPM_URL } from './constants';
	import InstallChip from './InstallChip.svelte';
</script>

<nav
	class="sticky top-0 z-[100] bg-[color-mix(in_srgb,var(--color-bg)_85%,transparent)] backdrop-blur-[12px] [-webkit-backdrop-filter:blur(12px)] border-b border-border"
>
	<div class="max-w-[1100px] mx-auto px-6 h-14 flex items-center justify-between gap-4">
		<a href="/" class="font-mono text-[14px] font-medium text-text tracking-[-0.01em]">
			linear-cli
		</a>
		<div class="flex items-center gap-2 max-md:hidden">
			<a
				href={GITHUB_URL}
				target="_blank"
				rel="noopener noreferrer"
				class="text-[13px] text-muted px-2.5 py-1.5 rounded-md transition-colors hover:text-text"
			>
				GitHub
			</a>
			<a
				href={NPM_URL}
				target="_blank"
				rel="noopener noreferrer"
				class="text-[13px] text-muted px-2.5 py-1.5 rounded-md transition-colors hover:text-text"
			>
				npm
			</a>
			<InstallChip />
		</div>
	</div>
</nav>
