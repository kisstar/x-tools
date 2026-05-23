import type { ToolManifest } from "@x-tools/types";
import * as Icons from "@x-tools/icons";
import { CategoryBadge } from "./CategoryBadge";

interface ToolCardProps {
  tool: ToolManifest;
}

export function ToolCard({ tool }: ToolCardProps) {
  const IconComponent = Icons[tool.icon as keyof typeof Icons];

  return (
    <button
      type="button"
      className="flex flex-col gap-3.5 p-4 rounded-lg border border-[var(--color-hairline)] bg-[var(--color-canvas)] text-left transition-shadow hover:shadow-[var(--dt-shadow-level-1)] cursor-pointer"
    >
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-[10px] bg-[var(--color-canvas-soft-2)] flex items-center justify-center shrink-0">
          {IconComponent && <IconComponent size={20} className="text-[var(--color-ink)]" />}
        </div>
        <div className="min-w-0">
          <h3 className="text-sm font-medium text-[var(--color-ink)] truncate">{tool.name}</h3>
        </div>
      </div>
      <p className="text-xs text-[var(--color-mute)] line-clamp-2 leading-relaxed">
        {tool.description}
      </p>
      <div className="mt-auto">
        <CategoryBadge category={tool.category} />
      </div>
    </button>
  );
}
