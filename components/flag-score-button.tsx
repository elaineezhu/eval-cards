"use client"

import { useMemo, useState } from "react"
import {
  Copy,
  ExternalLink,
  FileSearch,
  Flag,
  GitPullRequestArrow,
  MessageSquare,
} from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"

interface FlagScoreButtonProps {
  modelName: string
  modelId: string
  benchmarkName: string
  benchmarkId?: string
  score: number | string
  /** URL to the published source the score was extracted from (paper, blog, leaderboard). */
  sourceUrl?: string
  /** URL to the processed record JSON in the card_backend HF dataset. */
  sourceRecordUrl?: string
  /** Optional explicit upstream record URL in evaleval/EEE_datastore (raw source of truth). */
  eeeRecordUrl?: string
}

interface DatasetLinks {
  repoSlug: string
  recordViewUrl: string | null
  recordRawUrl: string | null
  discussionsUrl: string
  newDiscussionUrl: string
}

/**
 * Given a /resolve/main/... HF dataset URL, derive the helpful sibling URLs
 * for the dataset (file viewer, discussions list, new-discussion form). Returns
 * null when the input doesn't look like a HF dataset URL.
 */
function deriveDatasetLinks(recordUrl: string | undefined, prefilledTitle: string): DatasetLinks | null {
  if (!recordUrl) return null
  const m = recordUrl.match(
    /^https:\/\/huggingface\.co\/datasets\/([^/]+\/[^/]+)\/(?:resolve|raw|blob)\/[^/]+\/(.*)$/,
  )
  if (!m) return null
  const repoSlug = m[1]
  const path = m[2]
  const datasetBase = `https://huggingface.co/datasets/${repoSlug}`
  const recordViewUrl = `${datasetBase}/blob/main/${path}`
  const recordRawUrl = `${datasetBase}/resolve/main/${path}`
  const discussionsUrl = `${datasetBase}/discussions`
  const newDiscussionUrl = `${datasetBase}/discussions/new?title=${encodeURIComponent(prefilledTitle)}`
  return { repoSlug, recordViewUrl, recordRawUrl, discussionsUrl, newDiscussionUrl }
}

/**
 * "Flag this score" — researcher affordance that, instead of capturing the
 * report ourselves, sends the user directly to the upstream HF dataset where
 * the data lives. They can then file a discussion or submit a correction PR
 * against the actual record. We also offer a copyable context snippet so the
 * issue body has all the relevant identifiers without needing to retype them.
 */
export function FlagScoreButton({
  modelName,
  modelId,
  benchmarkName,
  benchmarkId,
  score,
  sourceUrl,
  sourceRecordUrl,
  eeeRecordUrl,
}: FlagScoreButtonProps) {
  const [open, setOpen] = useState(false)
  const [copied, setCopied] = useState<"context" | null>(null)

  const prefilledTitle = `Possible issue: ${modelName} on ${benchmarkName} (score ${score})`

  const cardBackendLinks = useMemo(
    () => deriveDatasetLinks(sourceRecordUrl, prefilledTitle),
    [sourceRecordUrl, prefilledTitle],
  )
  const eeeLinks = useMemo(
    () => deriveDatasetLinks(eeeRecordUrl, prefilledTitle),
    [eeeRecordUrl, prefilledTitle],
  )

  // Prefer the EEE upstream as the "correction venue" when known — that's
  // where raw evaluation records live. Fall back to card_backend (the
  // pipeline output) when EEE isn't directly addressable for this row.
  const correctionLinks = eeeLinks ?? cardBackendLinks

  const contextSnippet = [
    `Model: ${modelName} (${modelId})`,
    `Benchmark: ${benchmarkName}${benchmarkId ? ` (${benchmarkId})` : ""}`,
    `Reported score: ${score}`,
    sourceUrl ? `Original source URL: ${sourceUrl}` : null,
    sourceRecordUrl ? `Pipeline record: ${sourceRecordUrl}` : null,
    eeeRecordUrl ? `EEE upstream record: ${eeeRecordUrl}` : null,
  ]
    .filter(Boolean)
    .join("\n")

  const handleCopyContext = async () => {
    try {
      await navigator.clipboard.writeText(contextSnippet)
      setCopied("context")
      setTimeout(() => setCopied(null), 1800)
    } catch {
      // Clipboard might be blocked; ignore — the user can still select text manually.
    }
  }

  return (
    <>
      <Button
        type="button"
        size="sm"
        variant="outline"
        className="h-7 gap-1.5 text-xs"
        onClick={() => setOpen(true)}
      >
        <Flag className="h-3 w-3" />
        Flag this score
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Flag this score</DialogTitle>
            <DialogDescription>
              Take this report directly to the dataset where the record lives. You can file a
              discussion or open a correction PR against the actual file.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="rounded-xl border bg-muted/20 p-3 text-xs">
              <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                Flagging
              </div>
              <div className="mt-1">
                <span className="font-medium">{modelName}</span>{" "}
                <span className="text-muted-foreground">on</span>{" "}
                <span className="font-medium">{benchmarkName}</span>
              </div>
              <div className="text-muted-foreground tabular-nums">Score: {score}</div>
            </div>

            <div className="space-y-2">
              {correctionLinks?.recordViewUrl && (
                <a
                  href={correctionLinks.recordViewUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center justify-between rounded-xl border border-border/70 bg-background px-3 py-2.5 text-sm transition-colors hover:border-primary/40 hover:bg-muted/20"
                >
                  <div className="flex items-center gap-2">
                    <FileSearch className="h-4 w-4 text-muted-foreground" />
                    <div>
                      <div className="font-semibold">View the underlying record</div>
                      <div className="text-xs text-muted-foreground">
                        Opens the JSON file on{" "}
                        <span className="font-mono">{correctionLinks.repoSlug}</span>
                      </div>
                    </div>
                  </div>
                  <ExternalLink className="h-3.5 w-3.5 text-muted-foreground" />
                </a>
              )}

              {correctionLinks && (
                <a
                  href={correctionLinks.newDiscussionUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center justify-between rounded-xl border border-border/70 bg-background px-3 py-2.5 text-sm transition-colors hover:border-primary/40 hover:bg-muted/20"
                >
                  <div className="flex items-center gap-2">
                    <MessageSquare className="h-4 w-4 text-muted-foreground" />
                    <div>
                      <div className="font-semibold">Open a discussion</div>
                      <div className="text-xs text-muted-foreground">
                        Pre-filled title; paste the context snippet into the body.
                      </div>
                    </div>
                  </div>
                  <ExternalLink className="h-3.5 w-3.5 text-muted-foreground" />
                </a>
              )}

              {correctionLinks && (
                <a
                  href={correctionLinks.discussionsUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center justify-between rounded-xl border border-border/70 bg-background px-3 py-2.5 text-sm transition-colors hover:border-primary/40 hover:bg-muted/20"
                >
                  <div className="flex items-center gap-2">
                    <GitPullRequestArrow className="h-4 w-4 text-muted-foreground" />
                    <div>
                      <div className="font-semibold">Browse existing discussions</div>
                      <div className="text-xs text-muted-foreground">
                        Check whether someone already filed a similar correction.
                      </div>
                    </div>
                  </div>
                  <ExternalLink className="h-3.5 w-3.5 text-muted-foreground" />
                </a>
              )}

              {!correctionLinks && (
                <div className="rounded-xl border border-dashed border-amber-300/60 bg-amber-50/40 px-3 py-2.5 text-xs text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/20 dark:text-amber-200">
                  No upstream record URL is recorded for this row, so we can't link directly to
                  the dataset. Copy the context below and file an issue at{" "}
                  <a
                    className="underline-offset-4 hover:underline"
                    href="https://huggingface.co/datasets/evaleval/EEE_datastore/discussions"
                    target="_blank"
                    rel="noreferrer"
                  >
                    evaleval/EEE_datastore/discussions
                  </a>
                  .
                </div>
              )}
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="text-xs font-semibold text-muted-foreground">
                  Context to paste into the issue
                </label>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={handleCopyContext}
                  className="h-7 gap-1.5 text-xs"
                >
                  <Copy className="h-3 w-3" />
                  {copied === "context" ? "Copied" : "Copy"}
                </Button>
              </div>
              <pre className="max-h-40 overflow-auto whitespace-pre-wrap break-all rounded-xl border bg-muted/10 p-3 text-[11px] leading-5 text-muted-foreground">
                {contextSnippet}
              </pre>
            </div>

            <div className="flex justify-end pt-1">
              <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
                Close
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
