/**
 * Dev orchestrator: starts Vite, waits for the dev server to be reachable,
 * then launches Electron pointing at it. Watches the main-process source and
 * rebuilds (then restarts Electron) on change so iterating on IPC is cheap.
 */

import { spawn, type ChildProcess } from "node:child_process"
import { createRequire } from "node:module"
import path from "node:path"
import { fileURLToPath } from "node:url"

const require = createRequire(import.meta.url)
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const electronBin = require("electron") as string

const viteUrl = "http://localhost:5173"
let electronProc: ChildProcess | null = null

function startVite() {
  return spawn("pnpm", ["--filter", "@x-tools/app-main", "dev"], {
    stdio: "inherit",
    cwd: path.resolve(__dirname, "../.."),
    env: { ...process.env, VITE_DEV_SERVER_URL: viteUrl },
  })
}

async function waitForVite(): Promise<void> {
  for (let i = 0; i < 60; i++) {
    try {
      const res = await fetch(viteUrl)
      if (res.ok || res.status === 200) return
    } catch {
      /* not ready yet */
    }
    await new Promise((r) => setTimeout(r, 500))
  }
  throw new Error(`Vite dev server did not become ready at ${viteUrl}`)
}

function buildMain() {
  return new Promise<void>((resolve, reject) => {
    const p = spawn("pnpm", ["build:main"], {
      stdio: "inherit",
      cwd: path.resolve(__dirname, ".."),
    })
    p.on("close", (code) =>
      code === 0 ? resolve() : reject(new Error(`build:main exited with ${code}`)),
    )
  })
}

function startElectron() {
  electronProc?.kill()
  electronProc = spawn(electronBin, ["."], {
    stdio: "inherit",
    cwd: path.resolve(__dirname, ".."),
    env: { ...process.env, VITE_DEV_SERVER_URL: viteUrl, NODE_ENV: "development" },
  })
  electronProc.on("close", () => process.exit(0))
}

async function main() {
  const vite = startVite()
  await waitForVite()
  await buildMain()
  startElectron()

  process.on("SIGINT", () => {
    electronProc?.kill()
    vite.kill()
    process.exit(0)
  })
}

void main()
