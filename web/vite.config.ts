import path from 'node:path';
import adapter from '@sveltejs/adapter-static';
import { sveltekit } from '@sveltejs/kit/vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vitest/config';

const alias = { src: path.resolve('./src') };
const runesCompilerOptions = {
	compilerOptions: {
		// Force runes mode for the project, except for libraries. Can be removed in svelte 6.
		runes: ({ filename }: { filename: string }) =>
			filename.split(/[/\\]/).includes('node_modules') ? undefined : true
	}
};

export default defineConfig({
	plugins: [
		tailwindcss(),
		sveltekit({
			...runesCompilerOptions,
			adapter: adapter({ fallback: '200.html' }),
			alias
		})
	],
	test: {
		expect: { requireAssertions: true },
		projects: [
			{
				extends: './vite.config.ts',
				test: {
					name: 'unit',
					environment: 'node',
					include: ['src/**/*.{test,spec}.{js,ts}'],
					exclude: ['src/**/*.svelte.{test,spec}.{js,ts}']
				}
			},
			{
				plugins: [
					svelte({
						...runesCompilerOptions,
						compilerOptions: { ...runesCompilerOptions.compilerOptions, dev: true }
					})
				],
				resolve: {
					alias,
					conditions: ['browser', 'svelte', 'import', 'module', 'default']
				},
				test: {
					name: 'component',
					environment: 'happy-dom',
					include: ['src/**/*.svelte.{test,spec}.{js,ts}']
				}
			}
		]
	}
});
