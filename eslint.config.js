import js from '@eslint/js';
import tseslint from 'typescript-eslint';
export default tseslint.config(js.configs.recommended, ...tseslint.configs.recommended, {
  files: ['**/*.ts', '**/*.tsx'],
  rules: { '@typescript-eslint/no-explicit-any': 'error' },
}, { files: ['tests/**/*.mjs'], languageOptions: { globals: Object.fromEntries(['process','console','setTimeout','URL','chrome','indexedDB','performance','document','innerWidth','getComputedStyle'].map(x => [x, 'readonly'])) } });
