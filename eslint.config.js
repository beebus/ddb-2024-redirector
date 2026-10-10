import js from '@eslint/js'
import globals from 'globals'
import tseslint from 'typescript-eslint'
import pluginVue from 'eslint-plugin-vue'

export default tseslint.config(
  { ignores: ['dist', 'node_modules', 'scripts/.cache'] },

  js.configs.recommended,
  ...tseslint.configs.recommended,
  // "essential" flags likely bugs only; the stricter presets add template formatting opinions.
  ...pluginVue.configs['flat/essential'],

  {
    // Extension code runs in the browser (popup, options, content script) or a service worker.
    files: ['src/**/*.{ts,vue}'],
    languageOptions: {
      globals: { ...globals.browser, ...globals.serviceworker, chrome: 'readonly' },
    },
  },
  {
    // .vue files: let vue-eslint-parser handle the template, and TypeScript the <script>.
    files: ['**/*.vue'],
    languageOptions: {
      parserOptions: { parser: tseslint.parser },
    },
  },
  {
    // Build-time scripts and config run in Node.
    files: ['scripts/**/*.mjs', 'vite.config.ts', 'eslint.config.js'],
    languageOptions: { globals: globals.node },
  },
)
