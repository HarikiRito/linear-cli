// @ts-check
import js from '@eslint/js'
import tseslint from 'typescript-eslint'

export default tseslint.config(
  // Base JS recommended (subset only — Biome handles style/formatting)
  {
    ...js.configs.recommended,
    rules: {
      // Keep only correctness rules from JS recommended; disable style ones
      'no-undef': 'off', // TypeScript handles this
      'no-unused-vars': 'off', // typescript-eslint version is better
    },
  },

  // TypeScript type-aware rules — this is what ESLint is here for
  ...tseslint.configs.recommendedTypeChecked,

  // Language options and project service for type-aware linting
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },

  // Disable all formatting/stylistic rules — Biome owns those
  {
    rules: {
      // Biome handles these
      '@typescript-eslint/consistent-type-imports': 'off',
      '@typescript-eslint/consistent-type-definitions': 'off',
      '@typescript-eslint/member-ordering': 'off',
      '@typescript-eslint/naming-convention': 'off',
      '@typescript-eslint/quotes': 'off',
      '@typescript-eslint/semi': 'off',
      '@typescript-eslint/indent': 'off',
      '@typescript-eslint/comma-dangle': 'off',
      '@typescript-eslint/object-curly-spacing': 'off',

      // Turn down noisy rules that don't add type-safety value in this codebase
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-unsafe-call': 'off',
      '@typescript-eslint/no-unsafe-return': 'off',
      '@typescript-eslint/no-unsafe-argument': 'off',

      // Keep type-correctness rules as errors
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-misused-promises': 'error',
      '@typescript-eslint/await-thenable': 'error',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
    },
  },

  // Ignore built artifacts, config files, and codegen output
  {
    ignores: ['dist/**', 'node_modules/**', '*.config.js', '*.config.ts', '*.config.mjs', '*.config.mts', 'src/gql/**'],
  }
)
