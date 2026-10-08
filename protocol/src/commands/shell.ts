/**
 * Shell channel commands (§5.4). `elevated` is accepted here but the
 * elevation decision is language-agnostic and enforced in the capabilities
 * layer (§6.5), not by this schema.
 * ponytail: elevation gate lives in core capabilities, not the contract — add
 * a dedicated `shell.elevate` capability check when Step 3 wires the privileged helper.
 */

import { z } from "zod"

import { defineCommand } from "../define-command"

export const ShellExecArgs = z.object({
  command: z.string().min(1),
  args: z.array(z.string()).optional(),
  cwd: z.string().optional(),
  elevated: z.boolean().optional(),
})
export type ShellExecArgs = z.infer<typeof ShellExecArgs>

export const ShellExecResultSchema = z.object({
  code: z.number().int(),
  stdout: z.string(),
  stderr: z.string(),
})
export type ShellExecResultData = z.infer<typeof ShellExecResultSchema>

export const ShellEnvArgs = z.object({ name: z.string().min(1) })
export type ShellEnvArgs = z.infer<typeof ShellEnvArgs>

export const SHELL_EXEC = defineCommand({
  channel: "shell",
  command: "exec",
  args: ShellExecArgs,
  result: ShellExecResultSchema,
  capability: "shell.exec",
})

export const SHELL_ENV = defineCommand({
  channel: "shell",
  command: "env",
  args: ShellEnvArgs,
  result: z.string().nullable(),
  capability: "shell.exec",
})

export const SHELL_COMMANDS = [SHELL_EXEC, SHELL_ENV] as const
