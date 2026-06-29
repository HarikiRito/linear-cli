<script lang="ts">
	import { GITHUB_URL, NPM_URL } from './constants';
	import BrandIconLink from './BrandIconLink.svelte';
</script>

<nav
	class="sticky top-0 z-[100] bg-[color-mix(in_srgb,var(--color-bg)_85%,transparent)] backdrop-blur-[12px] [-webkit-backdrop-filter:blur(12px)] border-b border-border"
>
	<div class="max-w-275 mx-auto px-6 h-14 flex items-center justify-between gap-4">
		<a href="/" class="flex items-center gap-1.5 font-mono text-[14px] font-medium text-text tracking-[-0.01em]">
			<img src="/favicon.svg" alt="" width="24" height="24" class="rounded-md" aria-hidden="true" />
			linear-cli
		</a>
		<div class="flex items-center gap-2 max-md:hidden">
			<BrandIconLink brand="github" href={GITHUB_URL} label="GitHub" />
			<BrandIconLink brand="npm" href={NPM_URL} label="npm" />
		</div>
	</div>
</nav>
