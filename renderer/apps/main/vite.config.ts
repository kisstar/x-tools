import { defineConfig } from "vite"
import react from "@vitejs/plugin-react"
import tailwindcss from "@tailwindcss/vite"

// Tauri exposes env vars in dev. When running under `tauri dev` the renderer
// is served at the configured port and Tauri opens a webview that talks to
// the Vite server. The official template recommends:
//   - fixed port + strict (so Tauri's webview connects deterministically)
//   - host binding for tauri-android / tauri-ios; harmless on desktop
//   - skip clearing the screen so Cargo's compile output stays visible
const host = process.env.TAURI_DEV_HOST

export default defineConfig({
  plugins: [react(), tailwindcss()],
  // Vite ignores VITE_ envs that don't start with VITE_; expose Tauri envs
  // so we can read them in renderer code if needed.
  envPrefix: ["VITE_", "TAURI_"],
  clearScreen: false,
  server: {
    port: 5173,
    strictPort: true,
    host: host || false,
    hmr: host
      ? { protocol: "ws", host, port: 5174 }
      : undefined,
    watch: {
      // Don't watch the Rust side — Cargo handles that.
      ignored: ["**/tauri/target/**", "**/electron/dist/**"],
    },
  },
  build: {
    // Tauri only supports modern browsers (WebView2 / WKWebView).
    target: process.env.TAURI_PLATFORM === "windows" ? "chrome105" : "safari13",
    minify: !process.env.TAURI_DEBUG ? "esbuild" : false,
    sourcemap: !!process.env.TAURI_DEBUG,
  },
})
