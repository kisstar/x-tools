import { Sparkles, ArrowRight } from "@x-tools/icons";
import { useTranslate } from "@x-tools/i18n";

export function EmptyState() {
  const { t } = useTranslate();

  const popularTools = [
    { id: "json-formatter", name: t("empty.tools.json") },
    { id: "base64-codec", name: t("empty.tools.base64") },
    { id: "url-encoder", name: t("empty.tools.url") },
    { id: "hash-generator", name: t("empty.tools.hash") },
  ];

  return (
    <div className="flex flex-col items-center justify-center h-full text-center px-8">
      <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-[var(--color-canvas-soft-2)] to-[var(--color-hairline)] flex items-center justify-center mb-6">
        <Sparkles size={28} className="text-[var(--color-mute)]" />
      </div>
      <h1 className="text-xl font-semibold text-[var(--color-ink)] mb-2">
        {t("empty.title")}
      </h1>
      <p className="text-sm text-[var(--color-mute)] max-w-md mb-8">
        {t("empty.description")}
      </p>
      <div className="flex flex-col gap-2 w-full max-w-xs">
        {popularTools.map((tool) => (
          <button
            key={tool.id}
            type="button"
            className="flex items-center justify-between px-4 py-2.5 rounded-lg border border-[var(--color-hairline)] bg-[var(--color-canvas)] hover:bg-[var(--color-canvas-soft)] transition-colors text-sm text-[var(--color-body)] cursor-pointer"
          >
            <span>{tool.name}</span>
            <ArrowRight size={14} className="text-[var(--color-mute)]" />
          </button>
        ))}
      </div>
    </div>
  );
}
