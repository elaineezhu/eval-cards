# Linux gate (pre-push)

**Why this exists.** This app deploys to a HuggingFace Space. Pushing to the
Space's git remote (`hf.co`) **builds and deploys to prod immediately and runs no
tests**. There is no CI between "push" and "live." That gap is what caused the
linux-only DuckDB crashes (struct/timestamp marshalling that passed on Mac and
broke in prod, discovered by users days later). This gate is the enforcement
point for invariant **I5 — never deploy code that hasn't run on linux.**

## Activate (once per clone)

```bash
git config core.hooksPath hooks
```

Now `git push` runs `scripts/linux-gate.sh` and **aborts the push if it's red.**
Requires Docker (for the linux/amd64 leg).

Escape hatch (docs-only / emergency): `SKIP_LINUX_GATE=1 git push`.

## What it runs

1. **Host vitest** (`pnpm vitest run`) — unit/logic suite (connection-reset lifecycle, transforms). Fast; platform-agnostic logic.
2. **linux/amd64 DuckDB read-path smoke** (`scripts/linux-gate/smoke.mjs` in a container on the **prod-pinned `@duckdb/node-api`** version, read from `pnpm-lock.yaml`) — loads the snapshot views over httpfs into in-memory tables (mirroring prod `getConnection`, no `/data` mmap) and runs the real read paths through `readAll()`+`getRowObjectsJson()`. This is the net for the Mac↔linux marshalling divergence.

`SNAPSHOT_URL` defaults to the pinned prod snapshot; override via env to gate against a post-rebaseline snapshot.

## Coverage — grows as tests land

Today the linux leg is a read-path *smoke* (catches the marshalling-crash class).
As the comparison-index work proceeds, add to the linux leg:
- the **leaderboard parity** gate (query output vs the live `comparison-index`),
- **render-equivalence** for eval/histogram/DeepDive (silent-drop guard),
- the **`by_model`-removal consumer** test.

The smoke is the runner; these are its content. It is NOT a substitute for the
full gate (#12) — it's the enforcement substrate that makes the gate block deploys.

## Limitation (be honest)

A git hook protects whoever installs it, not the org — a fresh clone or a
collaborator who hasn't run `git config core.hooksPath hooks` can still push
unchecked. For solo/small-team that's acceptable; if pushes ever come from
multiple people or automation, move to a GitHub-mirror + Actions substrate
(runs the same gate on `ubuntu-latest`, enforced for everyone).
