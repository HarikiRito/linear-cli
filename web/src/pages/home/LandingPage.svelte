<script lang="ts">
	import LandingNav from './LandingNav.svelte';
	import LandingHero from './LandingHero.svelte';
	import FeatureGrid from './FeatureGrid.svelte';
	import LandingCTA from './LandingCTA.svelte';
	import LandingFooter from './LandingFooter.svelte';
</script>

<svelte:head>
	<title>Linear CLI — The Linear CLI built for agents.</title>
	<meta
		name="description"
		content="A CLI for Linear designed for agent/programmatic use. Outputs boxed tables for humans and plain-text for AI tooling."
	/>
</svelte:head>

<div class="min-h-screen">
	<LandingNav />
	<LandingHero />
	<FeatureGrid />
	<LandingCTA />
	<LandingFooter />
</div>
