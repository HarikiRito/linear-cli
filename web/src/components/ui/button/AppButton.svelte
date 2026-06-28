<script lang="ts">
	import { Button, type ButtonProps } from 'src/components/ui/button/index.js';

	const { class: className, ...rest }: ButtonProps = $props();
</script>

<Button class={className} {...rest} />
