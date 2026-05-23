import { useEffect } from "react"

function useKeyboardShortcut(key: string, meta: boolean, callback: () => void) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === key && (meta ? e.metaKey || e.ctrlKey : true)) {
        e.preventDefault()
        callback()
      }
    }
    document.addEventListener("keydown", handler)
    return () => document.removeEventListener("keydown", handler)
  }, [key, meta, callback])
}

export { useKeyboardShortcut }
