#!/usr/bin/env tsx
// model-resolution-rework — generate lib/model-url-redirects.ts.
//
// Reads a registry `baseline_resolution.json`, builds the old->new model
// route 301 map (canonical_id flips + casing re-keys), and writes the
// generated TS module.
//
// Usage:
//   tsx scripts/generate-model-redirects.ts \
//     --baseline /abs/path/to/baseline_resolution.json \
//     --out lib/model-url-redirects.ts
//
// Defaults (PROVISIONAL — regenerate from the post-M9 baseline at integration):
//   --baseline ../eval-card-registry/specs/model-resolution-rework/baseline_resolution.json
//   --out      lib/model-url-redirects.ts
//
// The default baseline path is relative to this repo root; pass --baseline to
// point at the final post-M9 file when it exists.

import { readFileSync, writeFileSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"

import { buildRedirects, serializeRedirectModule, type Baseline } from "../lib/model-url-redirects-build"

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const DEFAULT_BASELINE = resolve(
  REPO_ROOT,
  "../eval-card-registry/specs/model-resolution-rework/baseline_resolution.json",
)
const DEFAULT_OUT = resolve(REPO_ROOT, "lib/model-url-redirects.ts")

function parseArg(flag: string): string | undefined {
  const i = process.argv.indexOf(flag)
  return i >= 0 ? process.argv[i + 1] : undefined
}

function main() {
  const baselinePath = resolve(parseArg("--baseline") ?? DEFAULT_BASELINE)
  const outPath = resolve(parseArg("--out") ?? DEFAULT_OUT)

  const raw = readFileSync(baselinePath, "utf8")
  const baseline = JSON.parse(raw) as Baseline

  const { redirects, flipCount, casingCount, noopCount, ambiguous } = buildRedirects(baseline)

  const source = serializeRedirectModule(redirects, {
    source: baselinePath,
    flipCount,
    casingCount,
  })
  writeFileSync(outPath, source)

  // eslint-disable-next-line no-console
  console.log(
    `wrote ${outPath}: ${redirects.size} redirects ` +
      `(flips=${flipCount}, casing=${casingCount}, noop-skipped=${noopCount}, ` +
      `ambiguous-excluded=${ambiguous.size})\n` +
      `  source: ${baselinePath}`,
  )
  if (ambiguous.size > 0) {
    // eslint-disable-next-line no-console
    console.log(
      `  note: ${ambiguous.size} group roots fan out to multiple leaves and ` +
        `were left un-redirected (group page handles them).`,
    )
  }
}

main()
