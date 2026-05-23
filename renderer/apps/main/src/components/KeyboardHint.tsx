interface KeyboardHintProps {
  readonly keys: readonly string[]
}

function KeyboardHint({ keys }: KeyboardHintProps) {
  return (
    <span className="inline-flex items-center gap-0.5">
      {keys.map((key) => (
        <kbd
          key={key}
          className="inline-flex items-center justify-center min-w-[20px] px-1 py-0.5 rounded bg-[var(--color-canvas-soft-2)] border border-[var(--color-hairline)] text-[11px] font-medium text-[var(--color-mute)] font-mono"
        >
          {key}
        </kbd>
      ))}
    </span>
  )
}

export { KeyboardHint }
