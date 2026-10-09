/**
 * Splice the managed block into the full /etc/hosts text (plugin-model layer) —
 * pure `(currentText, block) → newText`. This is the half of the write flow
 * that MUST NOT touch anything outside the markers (PRD §6.2 data-integrity red
 * line: "保留 xTools 标记外内容"). Kept pure and separate from `renderHostsBlock`
 * so the node/ writer just composes `spliceHostsFile(current, renderHostsBlock(groups))`
 * and the risky "what overwrites the real file" logic is testable with no I/O.
 *
 * - Markers present (START before END): replace the region, preserve the exact
 *   prefix before START and suffix after END.
 * - Markers absent (or corrupted — only one marker, or END before START): append
 *   the block to the end. ponytail: a half-written/garbled block is treated as
 *   "no managed block" and appended rather than surgically repaired; a parse that
 *   reconciles a corrupted block belongs with the read-flow slice, not here.
 */

import { BLOCK_END, BLOCK_START } from "./render-hosts-block"

export function spliceHostsFile(currentText: string, block: string): string {
  const startIdx = currentText.indexOf(BLOCK_START)
  const endMarkerIdx = currentText.indexOf(BLOCK_END, startIdx + BLOCK_START.length)

  if (startIdx === -1 || endMarkerIdx === -1) {
    return appendBlock(currentText, block)
  }

  const prefix = currentText.slice(0, startIdx)
  // Drop a single newline that separated the old block from following content so
  // the replacement doesn't accumulate a blank line on every write; `block`
  // already carries its own trailing newline.
  const suffix = currentText.slice(endMarkerIdx + BLOCK_END.length).replace(/^\n/, "")

  return `${prefix}${block}${suffix}`
}

function appendBlock(currentText: string, block: string): string {
  if (currentText === "") return block
  const separator = currentText.endsWith("\n") ? "" : "\n"
  return `${currentText}${separator}${block}`
}
