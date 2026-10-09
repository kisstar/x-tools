/**
 * switch-host plugin manifest (§9.2, §10.1, §14.2) — the first real end-to-end
 * plugin, and a builtin. "builtin" buys exactly two things (§9.2): it ships in
 * the app bundle, and it may cross the §12.3 red lines. It is NOT a privileged
 * code path — same manifest format, lifecycle, gates, and disable semantics as
 * any third-party plugin.
 *
 * Why `shell.elevate` but NOT `fsScope: "unrestricted"`: writing /etc/hosts
 * needs root, so the write rides the elevate path (§6.5 — fixed whitelist
 * action, content via stdin, path enforced by core's path-guard, never trusting
 * a caller-supplied path). The plugin therefore declares the elevate capability
 * but needs no unrestricted fs scope — the single hosts path lives in core's
 * elevate whitelist, not in a broad plugin fs grant. Crossing only the red line
 * actually required (§17 least privilege).
 *
 * `switch-host.read` / `switch-host.write` are the plugin's own capabilities
 * (§13.2); the channel commands that will carry them land in the next slice.
 */

import type { PluginManifest } from "@x-tools/protocol"

export const SWITCH_HOST_READ = "switch-host.read"
export const SWITCH_HOST_WRITE = "switch-host.write"

export const switchHostManifest: PluginManifest = {
  id: "switch-host",
  builtin: true,
  runtimes: ["ui", "node"],
  capabilities: ["shell.elevate", SWITCH_HOST_READ, SWITCH_HOST_WRITE],
  contributes: {
    viewContainers: [
      {
        id: "switch-host",
        location: "primary",
        order: 10,
        emphasis: "normal",
        title: "Hosts 切换",
        icon: "network",
      },
    ],
    views: [
      {
        containerId: "switch-host",
        slot: "content",
        id: "editor",
        title: "Hosts 编辑器",
      },
      {
        containerId: "switch-host",
        slot: "subnav",
        id: "groups",
        title: "分组",
        tags: ["network"],
      },
    ],
  },
}
