import { afterEach, describe, expect, it, vi } from "vitest"

const originalEmbedSiteUrl = process.env.NEXT_PUBLIC_EMBED_SITE_URL

afterEach(() => {
  if (originalEmbedSiteUrl === undefined) {
    delete process.env.NEXT_PUBLIC_EMBED_SITE_URL
  } else {
    process.env.NEXT_PUBLIC_EMBED_SITE_URL = originalEmbedSiteUrl
  }
  vi.resetModules()
})

describe("resolveEmbedUrl", () => {
  it("falls back to the Hugging Face Space host for iframe snippets", async () => {
    delete process.env.NEXT_PUBLIC_EMBED_SITE_URL
    vi.resetModules()
    const { resolveEmbedUrl } = await import("@/components/embed-button")

    expect(resolveEmbedUrl("/embed/eval/distribution/aime-2025")).toBe(
      "https://evaleval-general-eval-card.hf.space/embed/eval/distribution/aime-2025",
    )
  })

  it("uses NEXT_PUBLIC_EMBED_SITE_URL when configured", async () => {
    process.env.NEXT_PUBLIC_EMBED_SITE_URL = "https://example.com///"
    vi.resetModules()
    const { resolveEmbedUrl } = await import("@/components/embed-button")

    expect(resolveEmbedUrl("/embed/eval/distribution/aime-2025")).toBe(
      "https://example.com/embed/eval/distribution/aime-2025",
    )
  })
})
