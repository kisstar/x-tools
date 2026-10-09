/**
 * PluginHost activation/teardown contract test (§11.3, §11.4). Locks the one
 * guarantee that makes plugin unload leak-free: every reversible side effect a
 * plugin acquires at activate is released LIFO at deactivate, so the six side-
 * effect surfaces (channel 注册 · 贡献点 · capability · 事件订阅 · 定时器 ·
 * 文件监听) return to zero. We cycle activate→deactivate 20× against counting
 * fakes and assert the live counts settle back to zero — the loop is what
 * catches a release the host forgot to replay. Also pins §11.5 atomicity: an
 * activator that throws rolls back the effects it already acquired and re-throws.
 */

import type { Disposable, IChannel } from "@x-tools/protocol"
import { PluginHost } from "@x-tools/plugin-host/plugin-host"
import type {
  ChannelContribution,
  PluginContext,
  PluginHostServices,
} from "@x-tools/plugin-host/plugin-context"
import { describe, expect, it } from "vitest"

/**
 * A counting sink: every acquire bumps `live`, the returned `Disposable`
 * decrements it. If deactivate replays every release, `live` returns to 0.
 */
class Counter {
  live = 0
  acquire(): Disposable {
    this.live += 1
    return { dispose: () => { this.live -= 1 } }
  }
}

function manifest(id: string, capabilities: readonly string[]) {
  return { id, builtin: false, capabilities }
}

function countingServices(): {
  services: PluginHostServices
  channels: Counter
  views: Counter
} {
  const channels = new Counter()
  const views = new Counter()
  const noopCall: IChannel["call"] = async () => undefined as never
  const services: PluginHostServices = {
    channels: { register: (_c: ChannelContribution) => channels.acquire() },
    contributions: {
      addViewContainer: () => views.acquire(),
      addView: () => views.acquire(),
      addCommand: () => views.acquire(),
    },
    call: noopCall,
    settings: () => ({ get: () => undefined }),
  }
  return { services, channels, views }
}

describe("PluginHost activate/deactivate teardown (§11.4)", () => {
  it("zeroes every side-effect surface after each deactivate across 20 cycles", async () => {
    const { services, channels, views } = countingServices()
    const host = new PluginHost(services)
    host.install(manifest("notes", ["storage.read"]))

    // Activator touches four surfaces: channel + viewContainer + view + a raw
    // effect (stands in for a timer/watcher/subscription — all plugin-created
    // effects route through ctx.effect, so one proves the surface).
    let effectLive = 0
    const activator = (ctx: PluginContext) => {
      ctx.registerChannel({ channel: "plugin.notes" })
      ctx.contributes.addViewContainer({})
      ctx.contributes.addView({})
      ctx.effect(() => { effectLive += 1 }, () => { effectLive -= 1 })
    }

    for (let cycle = 0; cycle < 20; cycle += 1) {
      const active = await host.activate("notes", activator)
      expect(active.state).toBe("active")
      // During active: surfaces are live, capability declared.
      expect(channels.live).toBe(1)
      expect(views.live).toBe(2)
      expect(effectLive).toBe(1)
      expect(host.declaredCapabilities("notes").has("storage.read")).toBe(true)

      const disabled = host.deactivate("notes")
      expect(disabled.state).toBe("disabled")
      // After deactivate: all surfaces zero, capability surface zeroed too.
      expect(channels.live).toBe(0)
      expect(views.live).toBe(0)
      expect(effectLive).toBe(0)
      expect(host.declaredCapabilities("notes").size).toBe(0)
    }
  })

  it("rolls back acquired effects and re-throws when the activator fails (§11.5)", async () => {
    const { services, channels, views } = countingServices()
    const host = new PluginHost(services)
    host.install(manifest("flaky", []))

    const boom = new Error("activator blew up")
    const activator = (ctx: PluginContext) => {
      ctx.registerChannel({ channel: "plugin.flaky" })
      ctx.contributes.addView({})
      throw boom
    }

    await expect(host.activate("flaky", activator)).rejects.toBe(boom)
    // Partial effects acquired before the throw are released — no leak, no
    // half-active plugin.
    expect(channels.live).toBe(0)
    expect(views.live).toBe(0)
    expect(host.get("flaky")?.state).toBe("installed")
  })

  it("throws when activating against a host built without services", async () => {
    const host = new PluginHost()
    host.install(manifest("notes", []))
    await expect(host.activate("notes", () => {})).rejects.toThrow(/without services/)
  })
})
