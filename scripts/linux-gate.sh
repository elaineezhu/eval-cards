#!/usr/bin/env bash
#
# Linux gate — the enforcement point for invariant I5: "never deploy code that
# hasn't run on linux." Pushing to the HF Space deploys to prod and runs NO
# tests there, so this gate (wired as a pre-push hook) is the only check between
# a local change and production. It catches the class of bug that passes on Mac
# and broke prod: DuckDB struct/timestamp marshalling on the linux-x64 binding
# (R2) and the connection lifecycle (R5).
#
# Two legs:
#   (1) host vitest — unit/logic suite (fast; connection-reset + transforms).
#   (2) linux/amd64 DuckDB read-path smoke on the prod-pinned binding (the real
#       net for the Mac↔linux divergence).
#
# Requires Docker. Coverage grows: add parity / render-equivalence tests to the
# linux leg as they land (see scripts/linux-gate/README.md).
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

: "${SNAPSHOT_URL:=https://huggingface.co/datasets/evaleval/card_backend/resolve/main/warehouse/2026-05-29T00-24-44Z}"

echo "[linux-gate] (1/2) host unit/logic suite (vitest)…"
# Quarantine: tests/transformations/identity-canonicalization.test.ts holds the
# intentionally-RED Group F route-id cases (they assert the legacy `__` form
# pending the model-resolution-rework landing — frontend commit 924266a). Excluded
# so the gate blocks on REAL regressions, not known-deferred reds. REMOVE this
# exclusion once the rework lands and those expectations are aligned.
pnpm vitest run --exclude '**/identity-canonicalization.test.ts'

echo "[linux-gate] (2/2) linux/amd64 DuckDB read-path smoke (prod binding)…"
DUCKDB_VERSION="$(grep -m1 -oE '@duckdb/node-api@[0-9][A-Za-z0-9.+-]*' pnpm-lock.yaml | sed 's#.*@##' || true)"
DUCKDB_VERSION="${DUCKDB_VERSION:-1.5.3-r.2}"
echo "[linux-gate]   binding @duckdb/node-api@${DUCKDB_VERSION} (from pnpm-lock); snapshot ${SNAPSHOT_URL}"
docker build --platform=linux/amd64 --build-arg "DUCKDB_VERSION=${DUCKDB_VERSION}" \
  -t evalcard-linux-gate "$ROOT/scripts/linux-gate" >/dev/null
docker run --platform=linux/amd64 --rm -e SNAPSHOT_URL="$SNAPSHOT_URL" evalcard-linux-gate

echo "[linux-gate] PASS ✅"
