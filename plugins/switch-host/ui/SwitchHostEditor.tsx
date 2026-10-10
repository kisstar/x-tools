/**
 * SwitchHostEditor (plugin-ui layer, §14.1) — the `editor` content view declared
 * in the manifest. Lists the host groups and toggles which are active; the
 * injected `SwitchHostData` facade is its only link to the backend (the renderer
 * host builds it from the single ChannelClient and passes it in — invariant 1,
 * ui never learns the transport). readOnly groups render disabled.
 *
 * Styling uses the shared design tokens (--color-*, matching the renderer's
 * ToolCard) so the plugin view sits inside the host shell without a theme of its
 * own. ponytail: no add/edit/delete UI yet — this slice is the active-toggle
 * loop end to end; CRUD lands when the node/ write commands grow.
 */

import type { SwitchHostData } from "../data/switch-host-data"
import { useSwitchHost } from "./use-switch-host"

interface SwitchHostEditorProps {
  readonly data: SwitchHostData
}

function SwitchHostEditor({ data }: SwitchHostEditorProps) {
  const { groups, loading, error, toggleGroup } = useSwitchHost(data)

  if (loading) {
    return <p className="p-4 text-sm text-[var(--color-mute)]">加载中…</p>
  }

  if (error) {
    return <p className="p-4 text-sm text-[var(--color-error)]">加载分组失败：{error.message}</p>
  }

  if (groups.length === 0) {
    return <p className="p-4 text-sm text-[var(--color-mute)]">暂无分组</p>
  }

  return (
    <ul className="flex flex-col gap-2 p-4">
      {groups.map((group) => (
        <li
          key={group.id}
          className="flex items-center justify-between gap-3 rounded-lg border border-[var(--color-hairline)] bg-[var(--color-canvas)] p-3"
        >
          <div className="min-w-0">
            <h3 className="truncate text-sm font-medium text-[var(--color-ink)]">{group.name}</h3>
            <p className="text-xs text-[var(--color-mute)]">{group.entries.length} 条记录</p>
          </div>
          <button
            type="button"
            disabled={group.readOnly}
            onClick={() => toggleGroup(group.id)}
            className="shrink-0 rounded-md border border-[var(--color-hairline)] px-3 py-1 text-xs text-[var(--color-ink)] transition-colors hover:bg-[var(--color-canvas-soft-2)] disabled:cursor-not-allowed disabled:text-[var(--color-mute)]"
          >
            {group.enabled ? "已启用" : "已停用"}
          </button>
        </li>
      ))}
    </ul>
  )
}

export { SwitchHostEditor }
export type { SwitchHostEditorProps }
