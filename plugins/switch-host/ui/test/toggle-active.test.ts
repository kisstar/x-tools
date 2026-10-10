/**
 * toggle-active contract — the view's selection math, provable in node (no DOM).
 * Locks: (1) activeIdsOf keeps only enabled groups, in order; (2) toggle adds a
 * missing id and removes a present one; (3) toggle never mutates its input.
 */

import { describe, expect, it } from "vitest"

import type { HostGroup } from "../../model/host-model"
import { activeIdsOf, toggleActive } from "../toggle-active"

function group(id: string, enabled: boolean): HostGroup {
  return {
    id,
    name: id,
    entries: [],
    enabled,
    pinned: false,
    autoEnable: false,
    readOnly: false,
    createdAt: 0,
    updatedAt: 0,
  }
}

describe("activeIdsOf", () => {
  it("keeps only enabled groups, preserving order", () => {
    expect(activeIdsOf([group("a", true), group("b", false), group("c", true)])).toEqual(["a", "c"])
  })
})

describe("toggleActive", () => {
  it("adds a missing id and removes a present one", () => {
    expect(toggleActive(["a"], "b")).toEqual(["a", "b"])
    expect(toggleActive(["a", "b"], "a")).toEqual(["b"])
  })

  it("does not mutate the input array", () => {
    const active = ["a"]
    toggleActive(active, "b")
    expect(active).toEqual(["a"])
  })
})
