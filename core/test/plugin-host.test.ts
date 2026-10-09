/**
 * PluginHost contract tests (§11.1, §12.3). These lock the install-time red
 * lines and the data feed behind gate ②: a third-party plugin may not declare
 * `shell.elevate` or `fsScope: "unrestricted"` — doing so lands it in `failed`
 * (not a thrown host crash) and leaves it declaring nothing, so its calls die
 * at gate ② with FORBIDDEN. The last test composes the host into
 * createChannelServer exactly as the electron main will, proving the seam.
 */

import { mkdtemp } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"

import type { CallContext } from "@x-tools/protocol"
import { commandId, STORAGE_GET } from "@x-tools/protocol"
import { ELEVATE_CAPABILITY, PluginHost } from "@x-tools/plugin-host/plugin-host"
import type { PluginManifest } from "@x-tools/plugin-host/plugin-host"
import { describe, expect, it } from "vitest"

import { createChannelServer } from "../src/create-channel-server"

function manifest(over: Partial<PluginManifest> & Pick<PluginManifest, "id">): PluginManifest {
  return { builtin: false, capabilities: [], ...over }
}

function pluginCtx(pluginId: string): CallContext {
  return { origin: "plugin", pluginId, transport: "ws", client: "browser", sessionId: "s" }
}

describe("PluginHost red lines (§12.3)", () => {
  it("rejects a third-party plugin that declares shell.elevate into failed", () => {
    const host = new PluginHost()
    const record = host.install(manifest({ id: "evil", capabilities: [ELEVATE_CAPABILITY] }))
    expect(record.state).toBe("failed")
    expect(record.diagnostic).toBeDefined()
    expect(host.declaredCapabilities("evil").size).toBe(0)
  })

  it("rejects a third-party plugin that declares fsScope unrestricted into failed", () => {
    const host = new PluginHost()
    const record = host.install(manifest({ id: "greedy", fsScope: "unrestricted" }))
    expect(record.state).toBe("failed")
    expect(host.declaredCapabilities("greedy").size).toBe(0)
  })

  it("lets a builtin plugin declare shell.elevate and installs it", () => {
    const host = new PluginHost()
    // Neutral sample id, not a real business module name: invariant 7's CI
    // grep for a business-module name under core/ must stay empty even in
    // test fixtures.
    const record = host.install(
      manifest({ id: "privileged-builtin", builtin: true, capabilities: [ELEVATE_CAPABILITY] }),
    )
    expect(record.state).toBe("installed")
    expect(host.declaredCapabilities("privileged-builtin").has(ELEVATE_CAPABILITY)).toBe(true)
  })

  it("installs an ordinary third-party plugin with its declared capabilities", () => {
    const host = new PluginHost()
    const record = host.install(manifest({ id: "notes", capabilities: ["storage.read"] }))
    expect(record.state).toBe("installed")
    expect(host.declaredCapabilities("notes").has("storage.read")).toBe(true)
  })
})

describe("PluginHost feeds channel-server gate ②", () => {
  it("passes a declared capability and FORBIDs undeclared / failed plugins", async () => {
    const host = new PluginHost()
    host.install(manifest({ id: "notes", capabilities: ["storage.read"] }))
    host.install(manifest({ id: "evil", capabilities: [ELEVATE_CAPABILITY] }))

    const baseDir = await mkdtemp(join(tmpdir(), "xtools-plugin-host-test-"))
    const server = createChannelServer({
      storageBaseDir: baseDir,
      declaredCapabilities: (id) => host.declaredCapabilities(id),
    })

    // "notes" declared storage.read → clears gate ②, reaches the handler.
    await expect(
      server.call(pluginCtx("notes"), commandId(STORAGE_GET), { key: "theme" }),
    ).resolves.toBeNull()

    // Never installed → declares nothing → FORBIDDEN.
    await expect(
      server.call(pluginCtx("ghost"), commandId(STORAGE_GET), { key: "theme" }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" })

    // Failed at install → declares nothing → FORBIDDEN.
    await expect(
      server.call(pluginCtx("evil"), commandId(STORAGE_GET), { key: "theme" }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" })
  })
})
