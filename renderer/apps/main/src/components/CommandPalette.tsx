import { useEffect, useRef } from "react";
import { Search, Sparkles, Clock, ArrowRight } from "@x-tools/icons";
import { useTranslate } from "@x-tools/i18n";
import { useCommandPaletteStore } from "../store/command-palette-store";
import { useKeyboardShortcut } from "../hooks/use-keyboard-shortcut";
import { KeyboardHint } from "./KeyboardHint";
import { mockTools } from "../data/mock-tools";

interface CommandResultItemProps {
  icon: React.ReactNode;
  label: string;
  onSelect: () => void;
}

function CommandResultItem({ icon, label, onSelect }: CommandResultItemProps) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className="flex items-center gap-3 w-full px-3 h-10 rounded-md hover:bg-[var(--color-canvas-soft)] transition-colors text-sm text-[var(--color-body)] cursor-pointer"
    >
      <span className="text-[var(--color-mute)]">{icon}</span>
      <span className="flex-1 text-left truncate">{label}</span>
      <ArrowRight size={14} className="text-[var(--color-mute)] opacity-0 group-hover:opacity-100" />
    </button>
  );
}

export function CommandPalette() {
  const { t } = useTranslate();
  const { isOpen, query, close, toggle, setQuery } = useCommandPaletteStore();
  const inputRef = useRef<HTMLInputElement>(null);

  useKeyboardShortcut("k", true, toggle);

  useEffect(() => {
    if (isOpen) {
      inputRef.current?.focus();
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    function handleEsc(e: KeyboardEvent) {
      if (e.key === "Escape") close();
    }
    document.addEventListener("keydown", handleEsc);
    return () => document.removeEventListener("keydown", handleEsc);
  }, [isOpen, close]);

  if (!isOpen) return null;

  const filteredTools = query
    ? mockTools.filter(
        (tool) =>
          tool.name.toLowerCase().includes(query.toLowerCase()) ||
          (tool.tags?.some((tag) => tag.includes(query.toLowerCase())) ?? false)
      )
    : mockTools.slice(0, 5);

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[20vh]">
      <div className="absolute inset-0 bg-black/50" onClick={close} />
      <div className="relative w-[640px] bg-[var(--color-canvas)] rounded-xl shadow-[var(--dt-shadow-level-3)] border border-[var(--color-hairline)] overflow-hidden">
        <div className="flex items-center gap-3 h-[52px] px-4 border-b border-[var(--color-hairline)]">
          <Search size={18} className="text-[var(--color-mute)] shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("commandPalette.placeholder")}
            className="flex-1 bg-transparent text-sm text-[var(--color-ink)] placeholder:text-[var(--color-mute)] outline-none"
          />
          <KeyboardHint keys={["Esc"]} />
        </div>

        <div className="max-h-[360px] overflow-y-auto p-2">
          {query === "" && (
            <div className="px-3 py-2">
              <span className="text-xs font-medium text-[var(--color-mute)] uppercase tracking-wide">
                {t("commandPalette.suggestions")}
              </span>
            </div>
          )}
          {filteredTools.map((tool) => (
            <CommandResultItem
              key={tool.id}
              icon={<Sparkles size={16} />}
              label={tool.name}
              onSelect={close}
            />
          ))}
          {query && filteredTools.length === 0 && (
            <div className="flex items-center justify-center h-20 text-sm text-[var(--color-mute)]">
              {t("commandPalette.noResults")}
            </div>
          )}
        </div>

        <div className="flex items-center justify-between h-10 px-4 border-t border-[var(--color-hairline)] bg-[var(--color-canvas-soft)]">
          <div className="flex items-center gap-4 text-xs text-[var(--color-mute)]">
            <span className="flex items-center gap-1">
              <KeyboardHint keys={["↑", "↓"]} />
              <span>{t("commandPalette.navigate")}</span>
            </span>
            <span className="flex items-center gap-1">
              <KeyboardHint keys={["↵"]} />
              <span>{t("commandPalette.open")}</span>
            </span>
          </div>
          <div className="flex items-center gap-1 text-xs text-[var(--color-mute)]">
            <Clock size={12} />
            <span>{t("commandPalette.recent")}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
