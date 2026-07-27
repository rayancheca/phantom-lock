import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';

export default tseslint.config(
  // `docs` joins the ignore list (S18): the recommended configs above are
  // unscoped, so anything outside `dist`/`coverage`/`.claude` was being linted
  // with no `globals` — which made every `console.log` in a session benchmark
  // script under the (gitignored) `docs/sessions/` an error, and broke the gate
  // on files that are evidence artifacts, not app code. The rules block below
  // has always been scoped to `src`; this makes the ignore list agree with it.
  { ignores: ['dist', 'coverage', 'node_modules', '.claude', 'docs'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  reactHooks.configs['recommended-latest'],
  {
    files: ['src/**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: { ...globals.browser },
    },
    rules: {
      // Allow intentional `_`-prefixed placeholders and destructure-to-omit.
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
          destructuredArrayIgnorePattern: '^_',
          ignoreRestSiblings: true,
        },
      ],
    },
  },
);
