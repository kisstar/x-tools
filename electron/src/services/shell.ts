import { spawn } from "node:child_process"
import type { ShellExecOptions, ShellExecResult } from "@x-tools/protocol"

/**
 * Run a single command and capture its stdout/stderr. Used by the
 * Switch-Host module to invoke `sudo` / write to /etc/hosts.
 *
 * NOTE: `elevated` is recorded for now but actual privilege elevation must
 * happen via a platform-specific helper (e.g. `sudo-prompt` on Electron, or
 * `tauri-plugin-shell` with a capability declaration). Wire that up when the
 * Switch-Host PRD lands.
 */
export const shellService = {
  exec(options: ShellExecOptions): Promise<ShellExecResult> {
    return new Promise((resolve, reject) => {
      const child = spawn(options.command, options.args ?? [], {
        cwd: options.cwd,
        shell: false,
      })
      let stdout = ""
      let stderr = ""
      child.stdout?.on("data", (chunk) => {
        stdout += chunk.toString()
      })
      child.stderr?.on("data", (chunk) => {
        stderr += chunk.toString()
      })
      child.on("error", reject)
      child.on("close", (code) => {
        resolve({ code: code ?? -1, stdout, stderr })
      })
    })
  },
}
