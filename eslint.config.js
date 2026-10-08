import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import globals from 'globals';
import prettier from 'eslint-config-prettier';

export default tseslint.config(
  { ignores: ['dist/', 'node_modules/', 'assets/', 'screenshots/'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: { globals: globals.browser },
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    },
  },
  {
    // Node globals only where code actually runs in Node; never in src/.
    files: ['tools/**', 'tests/**', '*.config.{js,ts}'],
    languageOptions: { globals: globals.node },
  },
  {
    // CLAUDE.md rule 2: the simulation is plain TypeScript and never touches the engine or the DOM.
    files: ['src/sim/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            { group: ['phaser', 'phaser/*'], message: 'src/sim/ must not import Phaser.' },
            { group: ['preact', 'preact/*'], message: 'src/sim/ must not import UI code.' },
            {
              group: ['**/render/**', '**/ui/**', '**/audio/**'],
              message: 'The simulation emits events instead of calling render/UI/audio.',
            },
          ],
        },
      ],
    },
  },
  prettier,
);
