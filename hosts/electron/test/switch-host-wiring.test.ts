/**
 * switch-host-wiring contract — the host's privileged write + storage round-trip
 * against a REAL temp fs (no electron, no root). Locks: (1) path-guard refuses
 * any target other than the allowed hosts path (§6.1); (2) a write backs up the
 * pre-write state before overwriting, and the write is atomic+correct (§6.2);
 * (3) groups persist and load back as the same shape, with a missing file
 * reading as [] (first-run); (4) the end-to-end setActive flow — storage +
 * guarded hosts write — composes through the real deps against a temp hosts
 * file, proving the host half wires node/ to the fs without root.
 */

import { mkdtemp, readFile, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { afterEach, describe, expect, it } from "vitest"

import {
  createSwitchHostDeps,
  hostsFilePathFor,
  writeHostsFileGuarded,
} from "../src/plugins/switch-host-wiring"

const dirs: string[] = []
async function tmp(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "switch-host-wiring-"))
  dirs.push(dir)
  return dir
}

afterEach(() => {
  // mkdtemp dirs are throwaway; the OS reaps tmp. Nothing to assert on teardown.
  dirs.length = 0
})

describe("writeHostsFileGuarded", () => {
  it("refuses to write any target other than the allowed hosts path", async () => {
    const dir = await tmp()
    await expect(
      writeHostsFileGuarded({
        targetPath: join(dir, "evil.txt"),
        allowedPath: join(dir, "hosts"),
        backupDir: dir,
        content: "pwned",
      }),
    ).rejects.toThrow(/refusing to write outside the hosts file/)
  })

  it("backs up the pre-write state, then writes the new content atomically", async () => {
    const dir = await tmp()
    const hosts = join(dir, "hosts")
    await writeFile(hosts, "127.0.0.1 localhost\n", "utf8")

    await writeHostsFileGuarded({
      targetPath: hosts,
      allowedPath: hosts,
      backupDir: dir,
      content: "127.0.0.1 localhost\n10.0.0.1 new.local\n",
    })

    expect(await readFile(hosts, "utf8")).toContain("new.local")
    // The prior content survives in the backup (§6.2 data integrity).
    expect(await readFile(join(dir, "hosts.backup"), "utf8")).toBe("127.0.0.1 localhost\n")
  })
})

describe("createSwitchHostDeps storage", () => {
  it("round-trips groups and reads a missing file as []", async () => {
    const dir = await tmp()
    const deps = createSwitchHostDeps({ storageBaseDir: dir, hostsFilePath: join(dir, "hosts") })

    expect(await deps.loadGroups()).toEqual([])

    const groups = [
      {
        id: "g1",
        name: "dev",
        entries: [{ id: "e1", ip: "1.1.1.1", domain: "api.local", enabled: true }],
        enabled: true,
        pinned: false,
        autoEnable: false,
        readOnly: false,
        createdAt: 0,
        updatedAt: 0,
      },
    ]
    await deps.saveGroups(groups)

    expect(await deps.loadGroups()).toEqual(groups)
  })

  it("setActive composes storage + guarded hosts write end to end", async () => {
    const dir = await tmp()
    const hosts = join(dir, "hosts")
    await writeFile(hosts, "127.0.0.1 localhost\n", "utf8")
    const deps = createSwitchHostDeps({ storageBaseDir: dir, hostsFilePath: hosts })

    await deps.saveGroups([
      {
        id: "g1",
        name: "dev",
        entries: [{ id: "e1", ip: "1.1.1.1", domain: "api.local", enabled: true }],
        enabled: false,
        pinned: false,
        autoEnable: false,
        readOnly: false,
        createdAt: 0,
        updatedAt: 0,
      },
    ])

    // Drive the real node flow through the real deps (no mocks on the write).
    const { createSwitchHostNode } = await import("@x-tools/switch-host/node/switch-host-node")
    await createSwitchHostNode(deps).setActive(["g1"])

    const written = await readFile(hosts, "utf8")
    expect(written).toContain("127.0.0.1 localhost") // outside the markers, preserved
    expect(written).toContain("api.local") // enabled group rendered into the managed block
  })
})

describe("hostsFilePathFor", () => {
  it("maps platform to the OS hosts path", () => {
    expect(hostsFilePathFor("darwin")).toBe("/etc/hosts")
    expect(hostsFilePathFor("linux")).toBe("/etc/hosts")
    expect(hostsFilePathFor("win32")).toBe("C:\\Windows\\System32\\drivers\\etc\\hosts")
  })
})
