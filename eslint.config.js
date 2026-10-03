import antfu from '@antfu/eslint-config'

const sourceFiles = [
  'apps/**/*.{js,mjs,ts,tsx}',
  'packages/**/*.{js,mjs,ts,tsx}',
  'tests/**/*.{js,mjs,ts,tsx}',
  '*.{js,mjs,ts}',
]
const eslintProject = new URL('./tsconfig.eslint.json', import.meta.url).pathname

export default antfu(
  {
    react: true,
    typescript: { tsconfigPath: eslintProject },
    formatters: { css: true, html: true },
    ignores: [
      '**/dist/**',
      '**/coverage/**',
      '**/node_modules/**',
      '**/.turbo/**',
      '**/.project.log/**',
      '**/test-results/**',
      '**/playwright-report/**',
      'pnpm-lock.yaml',
      '**/*.sum',
      'contracts/schema/**',
      'packages/contracts/src/generated.ts',
      '**/*.mmd',
      'design/**/*.pen',
      'DESIGN.md',
    ],
  },
  {
    name: 'xtools/architecture-boundaries',
    files: sourceFiles,
    rules: {
      'style/max-len': ['error', {
        code: 120,
        tabWidth: 2,
        ignoreUrls: true,
        ignoreStrings: true,
        ignoreTemplateLiterals: true,
        ignoreRegExpLiterals: true,
      }],
      'no-restricted-imports': ['error', {
        patterns: [
          {
            group: ['@xtools/*/src/**', '@xtools/**/src/**'],
            message: '禁止越过 package exports deep-import src。',
          },
        ],
      }],
    },
  },
  {
    name: 'xtools/web-runtime-boundaries',
    files: ['packages/web-runtime/**/*.{js,mjs,ts,tsx}'],
    rules: {
      'no-restricted-globals': ['error', 'WebSocket', 'localStorage'],
      'no-restricted-imports': ['error', {
        patterns: [
          {
            group: ['react', 'react-dom', '@tanstack/**', '@xtools/adapter-*', '@xtools/module-*', '@xtools/web'],
            message: 'web-runtime 只能包含宿主无关 runtime 机制。',
          },
          {
            group: ['@xtools/*/src/**', '@xtools/**/src/**'],
            message: '禁止越过 package exports deep-import src。',
          },
        ],
      }],
    },
  },
  {
    name: 'xtools/ui-module-boundaries',
    files: ['packages/modules/**/*.{js,mjs,ts,tsx}'],
    rules: {
      'no-restricted-globals': ['error', 'WebSocket', 'window', 'localStorage'],
      'no-restricted-imports': ['error', {
        patterns: [
          {
            group: ['@xtools/module-*', '@xtools/adapter-*', '@xtools/web'],
            message: 'UI module 禁止横向依赖其他模块、adapter 或 app。',
          },
          {
            group: ['@xtools/*/src/**', '@xtools/**/src/**'],
            message: '禁止越过 package exports deep-import src。',
          },
        ],
      }],
    },
  },
  {
    name: 'xtools/adapter-boundaries',
    files: ['packages/adapter-*/**/*.{js,mjs,ts,tsx}'],
    rules: {
      'no-restricted-imports': ['error', {
        patterns: [
          {
            group: ['@xtools/module-*', '@xtools/web'],
            message: 'adapter 禁止依赖 UI module 或 app。',
          },
          {
            group: ['@xtools/*/src/**', '@xtools/**/src/**'],
            message: '禁止越过 package exports deep-import src。',
          },
        ],
      }],
    },
  },
  {
    name: 'xtools/browser-composition',
    files: ['apps/web/**/*.{js,mjs,ts,tsx}', 'packages/modules/workbench-shell/**/*.{js,mjs,ts,tsx}', 'packages/adapter-ws/**/*.{js,mjs,ts,tsx}'],
    rules: {
      'no-restricted-globals': ['error', 'localStorage'],
    },
  },
  {
    name: 'xtools/root-and-e2e-types',
    files: ['*.config.ts', '*.workspace.ts', '**/vite.config.ts', 'tests/e2e/**/*.{ts,tsx}'],
    languageOptions: { parserOptions: { projectService: false, project: eslintProject } },
  },
  {
    name: 'xtools/node-test-runner',
    files: ['tests/architecture/**/*.test.mjs'],
    rules: {
      'test/no-import-node-test': 'off',
    },
  },
)
