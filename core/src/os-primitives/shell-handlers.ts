/**
 * shell OS-primitive handlers (§9). Pure node. `shell: false` — the command is
 * exec'd directly with an argv array, never through a shell, so caller strings
 * are never interpreted (no injection surface).
 * ponytail: `elevated` is accepted but intentionally NOT acted on here — the
 * privileged helper + fixed-whitelist elevation lands in Step 3 (§6.5), where a
 * dedicated `shell.elevate` capability gates it. Node is never run as root.
 */

import { spawn } from "node:child_process"
import type { SpawnOptions } from "node:child_process"

import type { ShellEnvArgs, ShellExecArgs, ShellExecResultData } from "@x-tools/protocol"

export interface ShellHandlers {
  exec: (args: ShellExecArgs) => Promise<ShellExecResultData>
  env: (args: ShellEnvArgs) => Promise<string | null>
}

export function makeShellHandlers(): ShellHandlers {
  return {
    exec(args) {
      return new Promise<ShellExecResultData>((resolve, reject) => {
        const options: SpawnOptions = {
          shell: false,
          ...(args.cwd !== undefined ? { cwd: args.cwd } : {}),
        }
        const child = spawn(args.command, args.args ?? [], options)

        let stdout = ""
        let stderr = ""
        child.stdout?.on("data", (chunk: Buffer) => (stdout += chunk.toString()))
        child.stderr?.on("data", (chunk: Buffer) => (stderr += chunk.toString()))
        child.on("error", reject)
        child.on("close", (code) => resolve({ code: code ?? -1, stdout, stderr }))
      })
    },

    async env(args) {
      return process.env[args.name] ?? null
    },
  }
}
