<script lang="ts">
	import { INSTALL_ALT_CMD, NODE_REQUIREMENT } from './constants';
	import InstallChip from './InstallChip.svelte';
</script>

<div class="flex flex-col items-center gap-2.5">
	<InstallChip />
	<div class="font-mono text-[12px] text-dim">or: {INSTALL_ALT_CMD}</div>
	<div class="text-[13px] text-dim mt-1.5">{NODE_REQUIREMENT}</div>
</div>
