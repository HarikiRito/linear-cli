<script lang="ts">
	import { DOCS_URL, GITHUB_URL, NPM_URL } from './constants';
	import BrandIconLink from './BrandIconLink.svelte';
</script>

<footer class="border-t border-border py-7 px-6">
	<div
		class="max-w-275 mx-auto flex items-center justify-between gap-4 flex-wrap max-md:flex-col max-md:items-start"
	>
		<span class="text-[13px] text-dim">Apache-2.0 licensed · Built with TypeScript</span>
		<div class="flex items-center gap-5">
			<a
				href={DOCS_URL}
				target="_blank"
				rel="noopener noreferrer"
				class="text-[13px] text-muted transition-colors hover:text-text"
			>
				Docs
			</a>
			<BrandIconLink brand="github" href={GITHUB_URL} label="GitHub" />
			<BrandIconLink brand="npm" href={NPM_URL} label="npm" />
		</div>
	</div>
</footer>
