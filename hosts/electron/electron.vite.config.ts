import { defineConfig, externalizeDepsPlugin } from "electron-vite"

/**
 * electron-vite drives the main + preload build. It bundles our workspace TS
 * source (whose package `exports` point at `.ts`) into runnable CJS under
 * `out/`, which plain `tsc` could not do — Node can't `require` a `.ts` file.
 *
 * The renderer is a separate workspace package (`@x-tools/app-main`) with its
 * own Vite toolchain, so no `renderer` section here: in dev it is served by
 * `pnpm dev` (localhost:5173), in prod from its own `dist/`.
 *
 * `externalizeDepsPlugin` keeps third-party `dependencies` external (not
 * bundled); `@x-tools/*` are excluded so they ARE bundled from source.
 */
const bundleWorkspace = { exclude: ["@x-tools/protocol", "@x-tools/core"] }

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin(bundleWorkspace)],
    build: {
      lib: { entry: { index: "src/main.ts" } },
    },
  },
  preload: {
    plugins: [externalizeDepsPlugin(bundleWorkspace)],
    build: {
      lib: { entry: { index: "src/preload.ts" } },
    },
  },
})
