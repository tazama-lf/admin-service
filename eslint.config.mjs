// SPDX-License-Identifier: Apache-2.0
import stylistic from '@stylistic/eslint-plugin';
import tsEslint from '@typescript-eslint/eslint-plugin';
import tsParser from '@typescript-eslint/parser';
import eslintStandard from 'eslint-config-love';
import eslintPluginEslintComments from 'eslint-plugin-eslint-comments';

export default [
  {
    files: ['**/*.ts'],
    plugins: {
      ...eslintStandard.plugins,
      ['eslint-comments']: eslintPluginEslintComments,
      ['@typescript-eslint']: tsEslint,
      ['@stylistic']: stylistic,
    },
    languageOptions: {
      ...eslintStandard.languageOptions,
      parser: tsParser,
      ecmaVersion: 2022,
      sourceType: 'module',
      parserOptions: {
        project: ['./tsconfig.json'],
      },
    },
    rules: {
      ...eslintStandard.rules,
      ...eslintPluginEslintComments.configs.recommended.rules,
      'eslint-comments/require-description': ['warn', { 'ignore': [] }],
      'eslint-comments/disable-enable-pair': 'warn',
      'no-console': 'warn',
      '@typescript-eslint/restrict-template-expressions': 'error',
      '@typescript-eslint/no-non-null-assertion': 'off',
      '@typescript-eslint/strict-boolean-expressions': 'off',
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-floating-promises': 'off',
      '@typescript-eslint/no-var-requires': 'off',
      '@typescript-eslint/no-use-before-define': 'off',
      '@typescript-eslint/prefer-optional-chain': 'off',
      '@stylistic/indent': ['error', 2],
      '@stylistic/semi': ['warn', 'always'],
      '@stylistic/quotes': ['error', 'single'],
      '@stylistic/quote-props': ['warn', 'as-needed'],
      '@stylistic/arrow-parens': ["warn", "always"],
    },
    ignores: [
      '**/coverage/**',
      '**/build/**',
      '**/node_modules/**',
      '**/__tests__/**',
      '**/jest.config.ts',
      '**/cluster-setup.ts',
    ],
  }
];
