<script lang="ts">
	import { NODE_REQUIREMENT } from './constants';
	import InstallChip from './InstallChip.svelte';
</script>

<div class="flex flex-col items-center gap-2.5">
	<InstallChip />
	<div class="text-[13px] text-dim mt-1.5">{NODE_REQUIREMENT}</div>
</div>
