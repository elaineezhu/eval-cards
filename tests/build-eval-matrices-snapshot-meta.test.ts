import { mkdtemp, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { pathToFileURL } from "node:url"
import { describe, expect, it } from "vitest"

import { readSnapshotSidecar } from "../scripts/build-eval-matrices.mjs"

// The documented local v2 loop points SNAPSHOT_URL at a file:// warehouse.
// Node's fetch has no file scheme, so that read has to go to disk or the
// build writes an unpinned `snapshot_id: "unknown"`.

describe("build-eval-matrices snapshot sidecar read", () => {
  it("reads a file:// snapshot off disk", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "snapmeta-"))
    await writeFile(
      path.join(dir, "snapshot_meta.json"),
      JSON.stringify({ snapshot_id: "2026-09-13T00:00:00Z" }),
    )

    const text = await readSnapshotSidecar(
      pathToFileURL(dir).href,
      "snapshot_meta.json",
    )
    expect(JSON.parse(text).snapshot_id).toBe("2026-09-13T00:00:00Z")

    // A plain directory path (no scheme) is a disk read too.
    const plain = await readSnapshotSidecar(dir, "snapshot_meta.json")
    expect(JSON.parse(plain).snapshot_id).toBe("2026-09-13T00:00:00Z")
  })

  it("still goes over the network for an https snapshot, and reports a bad status", async () => {
    const calls: string[] = []
    const original = globalThis.fetch
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      calls.push(String(input))
      return new Response('{"snapshot_id":"remote"}', { status: 200 })
    }) as typeof fetch
    try {
      const text = await readSnapshotSidecar(
        "https://huggingface.co/datasets/x/resolve/main/warehouse/s",
        "snapshot_meta.json",
      )
      expect(JSON.parse(text).snapshot_id).toBe("remote")
      expect(calls).toEqual([
        "https://huggingface.co/datasets/x/resolve/main/warehouse/s/snapshot_meta.json",
      ])

      globalThis.fetch = (async () =>
        new Response("nope", { status: 404, statusText: "Not Found" })) as typeof fetch
      await expect(
        readSnapshotSidecar("https://example.invalid/wh", "snapshot_meta.json"),
      ).rejects.toThrow("404")
    } finally {
      globalThis.fetch = original
    }
  })
})
