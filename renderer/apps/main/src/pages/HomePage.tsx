import { useMemo } from "react";
import { ToolCardGrid } from "../components/ToolCardGrid";
import { mockTools } from "../data/mock-tools";
import { useNavStore } from "../store/nav-store";

export function HomePage() {
  const activeCategoryId = useNavStore((s) => s.activeCategoryId);

  const filteredTools = useMemo(() => {
    if (activeCategoryId === "all") return mockTools;
    return mockTools.filter((tool) => tool.category === activeCategoryId);
  }, [activeCategoryId]);

  return <ToolCardGrid tools={filteredTools} />;
}
