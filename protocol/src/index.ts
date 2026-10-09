// New channel-RPC contract (§5) — the target surface.
export * from "./channel"
export * from "./channel-frames"
export * from "./define-command"
export * from "./events"
export * from "./plugin-manifest"
export * from "./commands/all-commands"
// Builtin plugin channel contracts (§13.1) — separate from ALL_COMMANDS: a
// plugin's commands/topics are plugin-namespaced and must not join the kernel's
// primitive registry or its EVENT_TOPICS union.
export * from "./commands/switch-host"
