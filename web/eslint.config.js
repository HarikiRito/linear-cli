import path from 'node:path';
import { defineConfig, includeIgnoreFile } from 'eslint/config';
import prettier from 'eslint-config-prettier';
import svelte from 'eslint-plugin-svelte';
import globals from 'globals';
import ts from 'typescript-eslint';

const gitignorePath = path.resolve(import.meta.dirname, '.gitignore');

export default defineConfig(
	includeIgnoreFile(gitignorePath),
	// Global ignores
	{
		ignores: [
			'.svelte-kit/**',
			'build/**',
			'dist/**',
			'coverage/**',
			'.ai/**',
			// shadcn-generated primitives (barrel exports and lowercase svelte primitives)
			'src/components/ui/**/index.ts',
			'src/components/ui/button/button.svelte',
			'src/components/ui/card/card.svelte',
			'src/components/ui/card/card-action.svelte',
			'src/components/ui/card/card-content.svelte',
			'src/components/ui/card/card-description.svelte',
			'src/components/ui/card/card-footer.svelte',
			'src/components/ui/card/card-header.svelte',
			'src/components/ui/card/card-title.svelte',
			'src/components/ui/dialog/dialog.svelte',
			'src/components/ui/dialog/dialog-close.svelte',
			'src/components/ui/dialog/dialog-content.svelte',
			'src/components/ui/dialog/dialog-description.svelte',
			'src/components/ui/dialog/dialog-footer.svelte',
			'src/components/ui/dialog/dialog-header.svelte',
			'src/components/ui/dialog/dialog-overlay.svelte',
			'src/components/ui/dialog/dialog-portal.svelte',
			'src/components/ui/dialog/dialog-title.svelte',
			'src/components/ui/dialog/dialog-trigger.svelte',
			'src/components/ui/dropdown-menu/dropdown-menu.svelte',
			'src/components/ui/dropdown-menu/dropdown-menu-checkbox-group.svelte',
			'src/components/ui/dropdown-menu/dropdown-menu-checkbox-item.svelte',
			'src/components/ui/dropdown-menu/dropdown-menu-content.svelte',
			'src/components/ui/dropdown-menu/dropdown-menu-group.svelte',
			'src/components/ui/dropdown-menu/dropdown-menu-group-heading.svelte',
			'src/components/ui/dropdown-menu/dropdown-menu-item.svelte',
			'src/components/ui/dropdown-menu/dropdown-menu-label.svelte',
			'src/components/ui/dropdown-menu/dropdown-menu-portal.svelte',
			'src/components/ui/dropdown-menu/dropdown-menu-radio-group.svelte',
			'src/components/ui/dropdown-menu/dropdown-menu-radio-item.svelte',
			'src/components/ui/dropdown-menu/dropdown-menu-separator.svelte',
			'src/components/ui/dropdown-menu/dropdown-menu-shortcut.svelte',
			'src/components/ui/dropdown-menu/dropdown-menu-sub.svelte',
			'src/components/ui/dropdown-menu/dropdown-menu-sub-content.svelte',
			'src/components/ui/dropdown-menu/dropdown-menu-sub-trigger.svelte',
			'src/components/ui/dropdown-menu/dropdown-menu-trigger.svelte',
			'src/components/ui/input/input.svelte',
			'src/components/ui/label/label.svelte',
			'src/components/ui/sonner/sonner.svelte',
			'src/components/ui/icons/Check.svelte',
			'src/components/ui/icons/ChevronRight.svelte',
			'src/components/ui/icons/CircleCheck.svelte',
			'src/components/ui/icons/Info.svelte',
			'src/components/ui/icons/Loader2.svelte',
			'src/components/ui/icons/Minus.svelte',
			'src/components/ui/icons/OctagonX.svelte',
			'src/components/ui/icons/TriangleAlert.svelte',
			'src/components/ui/icons/X.svelte'
		]
	},
	// Type-aware configs for .ts files
	{
		files: ['**/*.ts'],
		extends: [...ts.configs.strictTypeChecked, ...ts.configs.stylisticTypeChecked],
		languageOptions: {
			parserOptions: {
				projectService: true
			}
		}
	},
	// Type-aware configs for .svelte files
	{
		files: ['**/*.svelte', '**/*.svelte.ts', '**/*.svelte.js'],
		extends: [...ts.configs.strictTypeChecked, ...ts.configs.stylisticTypeChecked],
		languageOptions: {
			parserOptions: {
				projectService: true,
				extraFileExtensions: ['.svelte'],
				parser: ts.parser
			}
		}
	},
	// Svelte plugin
	...svelte.configs.recommended,
	// Shared rules for all linted files
	{
		languageOptions: { globals: { ...globals.browser, ...globals.node } },
		rules: {
			'no-undef': 'off',
			// SPA mode: standard <a> links are fine; resolve() is not needed
			'svelte/no-navigation-without-resolve': 'off',
			// Strict TypeScript rules
			'@typescript-eslint/no-explicit-any': 'error',
			'@typescript-eslint/no-unused-vars': [
				'error',
				{
					vars: 'all',
					args: 'after-used',
					ignoreRestSiblings: false,
					argsIgnorePattern: '^_',
					varsIgnorePattern: '^_',
					destructuredArrayIgnorePattern: '^_',
					caughtErrorsIgnorePattern: '^(_|ignore)'
				}
			],
			'@typescript-eslint/no-floating-promises': 'error',
			'@typescript-eslint/no-misused-promises': 'error',
			'@typescript-eslint/await-thenable': 'error',
			'@typescript-eslint/no-unnecessary-type-assertion': 'error',
			'@typescript-eslint/switch-exhaustiveness-check': 'error',
			'@typescript-eslint/consistent-type-imports': ['error', { prefer: 'type-imports' }],
			'@typescript-eslint/no-non-null-assertion': 'warn',
			'@typescript-eslint/no-deprecated': 'warn',
			'prefer-const': 'error',
			'prefer-template': 'error',
			// Turn off noisy rules
			'@typescript-eslint/strict-boolean-expressions': 'off',
			'@typescript-eslint/no-unnecessary-condition': 'off',
			'@typescript-eslint/no-unnecessary-type-parameters': 'off',
			'@typescript-eslint/no-misused-spread': 'off',
			'@typescript-eslint/unbound-method': 'off',
			'@typescript-eslint/require-await': 'off',
			'@typescript-eslint/no-unsafe-argument': 'off',
			'@typescript-eslint/no-unsafe-assignment': 'off',
			'@typescript-eslint/no-unsafe-member-access': 'off',
			'@typescript-eslint/no-unsafe-call': 'off',
			'@typescript-eslint/restrict-template-expressions': 'off',
			'@typescript-eslint/prefer-nullish-coalescing': 'off',
			'@typescript-eslint/no-confusing-void-expression': 'off',
			'@typescript-eslint/no-extraneous-class': 'off',
			'no-constant-binary-expression': 'off'
		}
	},
	// Svelte 5 rune override: $bindable() in $props() requires `let`, not `const`
	// prefer-const is a false positive in Svelte components with bindable props
	{
		files: ['**/*.svelte'],
		rules: {
			'prefer-const': 'off'
		}
	},
	// Prettier last (disables formatting rules)
	prettier,
	...svelte.configs.prettier
);
