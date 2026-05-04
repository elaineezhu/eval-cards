import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Render an `evaluation_id` for human eyes.
 *
 * Backend evaluation_ids are RFC 3986 percent-encoded so they're safe
 * as URL path segments — `wasp%2Fjudgebench-coding` for the (composite,
 * benchmark) pair `wasp/judgebench-coding`. The encoded form is fine for
 * routes and React keys, but reads as nonsense in research-view labels.
 *
 * `humanizeEvaluationId` decodes the slug and falls back to the input
 * when decoding fails (malformed sequences, etc.) so it's always safe
 * to drop in at a render site.
 */
export function humanizeEvaluationId(value: string | null | undefined): string {
  if (!value) return ""
  try {
    return decodeURIComponent(value)
  } catch {
    return value
  }
}

/**
 * Format an evaluation timestamp as `YYYY-MM-DD` for table cells.
 *
 * Accepts the two shapes the backend emits:
 *   - ISO date-time strings (`"2026-04-29T00:00:00Z"`)
 *   - Unix-epoch numerics as strings (`"1777496278.157"`)
 *
 * Returns `"Unknown"` when the value is missing or unparseable. Lossy
 * by design — the `Updated` column shows the date only, not time.
 *
 * Day-precision timestamps are interpreted in UTC (`toISOString()`)
 * rather than the local zone so a `2026-04-29T00:00:00Z` value renders
 * as `2026-04-29` everywhere instead of slipping to `2026-04-28` west of
 * UTC.
 */
export function formatDateISO(ts: string | null | undefined): string {
  if (!ts || !String(ts).trim()) return "Unknown"
  const raw = String(ts)
  const numeric = Number(raw)
  const parsed =
    !Number.isNaN(numeric) && !raw.includes("-")
      ? new Date(numeric * 1000)
      : new Date(raw)
  if (Number.isNaN(parsed.getTime())) return "Unknown"
  return parsed.toISOString().slice(0, 10)
}
