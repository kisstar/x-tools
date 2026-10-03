import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'

const root = fileURLToPath(new URL('../..', import.meta.url))

export default defineConfig({
  root,
  resolve: { alias: {
    '@xtools/adapter-ws': fileURLToPath(new URL('../../packages/adapter-ws/src/index.ts', import.meta.url)),
    '@xtools/contracts': fileURLToPath(new URL('../../packages/contracts/src/index.ts', import.meta.url)),
    '@xtools/module-recent-tools': fileURLToPath(new URL('../../packages/modules/recent-tools/src/index.ts', import.meta.url)),
    '@xtools/module-workbench-home': fileURLToPath(new URL('../../packages/modules/workbench-home/src/index.ts', import.meta.url)),
    '@xtools/module-workbench-settings': fileURLToPath(new URL('../../packages/modules/workbench-settings/src/index.tsx', import.meta.url)),
    '@xtools/module-workbench-shell': fileURLToPath(new URL('../../packages/modules/workbench-shell/src/index.ts', import.meta.url)),
    '@xtools/ui-contracts': fileURLToPath(new URL('../../packages/ui-contracts/src/index.ts', import.meta.url)),
    '@xtools/web-runtime': fileURLToPath(new URL('../../packages/web-runtime/src/index.ts', import.meta.url)),
  } },
})
