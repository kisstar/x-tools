// New channel-RPC contract (§5) — the target surface.
export * from "./channel"
export * from "./define-command"
export * from "./events"
export * from "./commands/all-commands"

// Legacy Bridge contract — kept exported during the migration (Steps 1-3),
// removed in Step 4 once channel-client replaces platform-bridge.
export * from "./channels"
export * from "./types"
export * from "./ports"
