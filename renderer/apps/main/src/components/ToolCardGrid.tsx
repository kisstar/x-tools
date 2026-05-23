import type { ToolManifest } from "@x-tools/types";
import { ToolCard } from "./ToolCard";

interface ToolCardGridProps {
  tools: ToolManifest[];
}

export function ToolCardGrid({ tools }: ToolCardGridProps) {
  return (
    <div className="grid grid-cols-3 gap-4">
      {tools.map((tool) => (
        <ToolCard key={tool.id} tool={tool} />
      ))}
    </div>
  );
}
