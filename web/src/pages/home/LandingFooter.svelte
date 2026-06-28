<script lang="ts">
	import { DOCS_URL, GITHUB_URL, NPM_URL } from './constants';
</script>

<footer class="border-t border-border py-7 px-6">
	<div
		class="max-w-[1100px] mx-auto flex items-center justify-between gap-4 flex-wrap max-md:flex-col max-md:items-start"
	>
		<span class="text-[13px] text-dim">MIT licensed · Built with TypeScript</span>
		<div class="flex items-center gap-5">
			<a
				href={DOCS_URL}
				target="_blank"
				rel="noopener noreferrer"
				class="text-[13px] text-muted transition-colors hover:text-text"
			>
				Docs
			</a>
			<a
				href={GITHUB_URL}
				target="_blank"
				rel="noopener noreferrer"
				class="text-[13px] text-muted transition-colors hover:text-text"
			>
				GitHub
			</a>
			<a
				href={NPM_URL}
				target="_blank"
				rel="noopener noreferrer"
				class="text-[13px] text-muted transition-colors hover:text-text"
			>
				npm
			</a>
		</div>
	</div>
</footer>
