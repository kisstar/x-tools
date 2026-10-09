/**
 * LIFO effect ledger (§11.3) — the one mechanism that makes plugin unload leak-
 * free. Every reversible side effect a plugin acquires is paired here with its
 * release; `disposeAll` replays releases in reverse acquisition order, so
 * dependencies unwind correctly (built last, torn down first). Plugins never
 * write teardown logic — the host owns the ledger, which is why "漏掉一个
 * release" can't happen.
 */

export class EffectLedger {
  // ponytail: internal mutable buffer (like a Map) — not shared state, so the
  // immutability rule doesn't apply; callers only see acquire/dispose.
  readonly #releases: Array<() => void> = []

  run<T>(acquire: () => T, release: (resource: T) => void): T {
    const resource = acquire()
    this.#releases.push(() => {
      release(resource)
    })
    return resource
  }

  /**
   * Release everything LIFO. Every release runs even if one throws (a half-torn
   * plugin is the leak we're preventing); the first error is re-thrown after so
   * it isn't silently swallowed.
   */
  disposeAll(): void {
    let firstError: unknown
    for (let i = this.#releases.length - 1; i >= 0; i -= 1) {
      const release = this.#releases[i]
      if (release === undefined) continue
      try {
        release()
      } catch (error: unknown) {
        firstError ??= error
      }
    }
    this.#releases.length = 0
    if (firstError !== undefined) throw firstError
  }

  get size(): number {
    return this.#releases.length
  }
}
