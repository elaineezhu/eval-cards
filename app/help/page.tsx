import Link from "next/link"
import type { Metadata } from "next"
import { ArrowRight, ExternalLink, FileText } from "lucide-react"

import { CiteSection, PAPER_URL } from "@/components/cite-section"
import { Navigation } from "@/components/navigation"
import { ReplayIntroButton } from "@/components/replay-intro-button"
import { DOCS, TUTORIALS } from "@/lib/tutorials"

export const metadata: Metadata = {
  title: "Help",
  description:
    "Learn how to read Evaluation Cards: a quickstart, stakeholder guides, documentation, and how to contribute.",
}

const quickstart = TUTORIALS.find((t) => t.slug === "quickstart")!
const stakeholderGuides = TUTORIALS.filter((t) => t.slug !== "quickstart")

const linkCls = "text-[color:var(--fg)] underline underline-offset-2 hover:opacity-80"
const EEE_SITE = "https://evalevalai.com/every_eval_ever/"
const EEE_ISSUES = "https://github.com/evaleval/every_eval_ever/issues"
const HF_DISCUSSIONS = "https://huggingface.co/spaces/evaleval/general-eval-card/discussions"
const ROADMAP = "https://changemap.co/evaleval/evalcards/"

export default function HelpPage() {
  return (
    <div className="min-h-screen bg-background">
      <Navigation />

      <main className="mx-auto w-full max-w-[64rem] px-4 pb-24 pt-12 sm:px-8">
        {/* HEADER --------------------------------------------------------- */}
        <div className="kicker">Help</div>
        <h1
          className="mt-2 mb-7"
          style={{
            fontSize: "clamp(40px, 5.2vw, 56px)",
            fontWeight: 700,
            letterSpacing: "-0.03em",
            lineHeight: 1.05,
            color: "var(--fg)",
          }}
        >
          How to use Evaluation Cards.
        </h1>
        <p className="mb-8 text-[19px] leading-[1.6] text-[color:var(--fg-muted)]">
          New here? Start with the quickstart, then dive into a guide written for your role.
          You can replay the intro tour at any time.
        </p>
        <ReplayIntroButton />

        {/* QUICKSTART ----------------------------------------------------- */}
        <section className="mt-14 mb-14">
          <div className="section-head">
            <h2>Quickstart</h2>
          </div>
          <Link
            href={`/help/${quickstart.slug}`}
            className="group flex flex-col gap-3 border border-[color:var(--border-soft)] bg-[color:var(--fg)] p-7 text-[color:var(--bg)] sm:flex-row sm:items-center sm:justify-between"
          >
            <div>
              <div className="kicker mb-2" style={{ color: "var(--accent)" }}>
                {quickstart.audience}
              </div>
              <h3 className="m-0 mb-1.5 text-xl font-semibold">{quickstart.title}</h3>
              <p
                className="m-0 max-w-[44ch] text-[14px] leading-[1.6]"
                style={{ color: "color-mix(in srgb, var(--bg) 78%, transparent)" }}
              >
                {quickstart.blurb}
              </p>
            </div>
            <span className="inline-flex shrink-0 items-center gap-2 font-mono text-[11px] uppercase tracking-[0.12em]">
              Start reading
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" aria-hidden />
            </span>
          </Link>
        </section>

        {/* TUTORIALS BY STAKEHOLDER --------------------------------------- */}
        <section className="mb-14">
          <div className="section-head">
            <h2>Tutorials by stakeholder</h2>
          </div>
          <p className="mb-5 max-w-[700px] text-[15px] leading-[1.7] text-[color:var(--fg-muted)]">
            Each guide reads the same record through a different lens. Pick the one closest to
            how you'll use Evaluation Cards.
          </p>
          <div className="grid gap-5 sm:grid-cols-2">
            {stakeholderGuides.map((guide) => (
              <Link
                key={guide.slug}
                href={`/help/${guide.slug}`}
                className="group flex flex-col border border-[color:var(--border-soft)] bg-[color:var(--bg-warm)] p-[22px] transition-colors hover:border-[color:var(--border-strong)]"
              >
                <div className="kicker mb-2">{guide.audience}</div>
                <h3 className="m-0 mb-2 flex items-center gap-2 text-base font-semibold tracking-[-0.005em] text-[color:var(--fg)]">
                  {guide.title}
                  <ArrowRight
                    className="h-3.5 w-3.5 text-[color:var(--fg-subtle)] transition-transform group-hover:translate-x-0.5"
                    aria-hidden
                  />
                </h3>
                <p className="m-0 text-[13.5px] leading-[1.6] text-[color:var(--fg-muted)]">
                  {guide.blurb}
                </p>
              </Link>
            ))}
          </div>
        </section>

        {/* DOCUMENTATION -------------------------------------------------- */}
        <section className="mb-14">
          <div className="section-head">
            <h2>Documentation</h2>
          </div>
          <p className="mb-5 max-w-[700px] text-[15px] leading-[1.7] text-[color:var(--fg-muted)]">
            Deeper, more technical references for contributing to and working with the data
            behind Evaluation Cards.
          </p>
          <div className="grid gap-5 sm:grid-cols-2">
            {DOCS.map((doc) => (
              <Link
                key={doc.slug}
                href={`/help/${doc.slug}`}
                className="group flex flex-col border border-[color:var(--border-soft)] bg-[color:var(--bg-warm)] p-[22px] transition-colors hover:border-[color:var(--border-strong)]"
              >
                <div className="kicker mb-2 flex items-center gap-1.5">
                  <FileText className="h-3 w-3" aria-hidden />
                  {doc.audience}
                </div>
                <h3 className="m-0 mb-2 flex items-center gap-2 text-base font-semibold tracking-[-0.005em] text-[color:var(--fg)]">
                  {doc.title}
                  <ArrowRight
                    className="h-3.5 w-3.5 text-[color:var(--fg-subtle)] transition-transform group-hover:translate-x-0.5"
                    aria-hidden
                  />
                </h3>
                <p className="m-0 text-[13.5px] leading-[1.6] text-[color:var(--fg-muted)]">
                  {doc.blurb}
                </p>
              </Link>
            ))}

            {/* External: how to contribute evaluation results to EEE */}
            <a
              href="https://evalevalai.com/every_eval_ever/"
              target="_blank"
              rel="noreferrer"
              className="group flex flex-col border border-[color:var(--border-soft)] bg-[color:var(--bg-warm)] p-[22px] transition-colors hover:border-[color:var(--border-strong)]"
            >
              <div className="kicker mb-2 flex items-center gap-1.5">
                <ExternalLink className="h-3 w-3" aria-hidden />
                External · EvalEval
              </div>
              <h3 className="m-0 mb-2 flex items-center gap-2 text-base font-semibold tracking-[-0.005em] text-[color:var(--fg)]">
                Add results to Every Eval Ever
                <ExternalLink
                  className="h-3.5 w-3.5 text-[color:var(--fg-subtle)] transition-transform group-hover:-translate-y-0.5"
                  aria-hidden
                />
              </h3>
              <p className="m-0 text-[13.5px] leading-[1.6] text-[color:var(--fg-muted)]">
                The Every Eval Ever contributor site explains how to add evaluation results to the
                datastore that powers Evaluation Cards.
              </p>
            </a>
          </div>
          <p className="mt-4 text-[13px] leading-[1.6] text-[color:var(--fg-subtle)]">
            Suggest missing documentation on our{" "}
            <a
              href="https://changemap.co/evaleval/evalcards/"
              target="_blank"
              rel="noreferrer"
              className="underline underline-offset-2 hover:text-[color:var(--fg)]"
            >
              public roadmap
            </a>{" "}
            and we'll make sure to add it!
          </p>
        </section>

        {/* HOW TO CONTRIBUTE ---------------------------------------------- */}
        <section id="how-to-contribute" className="mb-8 scroll-mt-24">
          <div className="section-head">
            <h2>How to contribute</h2>
          </div>
          <p className="mb-5 max-w-[720px] text-[15px] leading-[1.7] text-[color:var(--fg-muted)]">
            Evaluation Cards is a living, community artifact — its coverage and usefulness grow as
            people report, upload, use, and cite it. Here's what helps most, depending on who you
            are.
          </p>
          <div className="grid gap-5 sm:grid-cols-2">
            {/* MODEL DEVELOPERS */}
            <div className="border border-[color:var(--border-soft)] bg-[color:var(--bg-warm)] p-[22px]">
              <div className="kicker mb-2">Model developers</div>
              <ul className="m-0 list-disc space-y-2 pl-4 text-[13.5px] leading-[1.6] text-[color:var(--fg-muted)] marker:text-[color:var(--fg-subtle)]">
                <li>
                  Report your model's results to{" "}
                  <a href={EEE_SITE} target="_blank" rel="noreferrer" className={linkCls}>
                    Every Eval Ever
                  </a>{" "}
                  so they show up here in context.
                </li>
                <li>
                  Already on EEE?{" "}
                  <Link href="/help/cross-post-to-hugging-face" className={linkCls}>
                    Cross-post them to Hugging Face
                  </Link>{" "}
                  so your scores appear on the model page with a backlink.
                </li>
                <li>
                  Document the run-level details that raise your signals — temperature and max
                  tokens, the harness, and (for agentic evaluations) the eval plan and limits.
                </li>
                <li>
                  See a wrong or missing number for your model? Flag it in the{" "}
                  <a href={HF_DISCUSSIONS} target="_blank" rel="noreferrer" className={linkCls}>
                    Space discussions
                  </a>{" "}
                  or via each record's correction path.
                </li>
              </ul>
            </div>

            {/* EVALUATION DEVELOPERS */}
            <div className="border border-[color:var(--border-soft)] bg-[color:var(--bg-warm)] p-[22px]">
              <div className="kicker mb-2">Evaluation developers</div>
              <ul className="m-0 list-disc space-y-2 pl-4 text-[13.5px] leading-[1.6] text-[color:var(--fg-muted)] marker:text-[color:var(--fg-subtle)]">
                <li>
                  Upload your benchmark's results to{" "}
                  <a href={EEE_SITE} target="_blank" rel="noreferrer" className={linkCls}>
                    Every Eval Ever
                  </a>{" "}
                  so others can find, run, and reuse them.
                </li>
                <li>
                  Fill in your benchmark's metadata — goals, construct, scoring rubric, intended
                  uses, and limitations — to raise its{" "}
                  <Link href="/help/how-signals-are-computed" className={linkCls}>
                    completeness score
                  </Link>
                  .
                </li>
                <li>
                  Report schema gaps or data issues on the{" "}
                  <a href={EEE_ISSUES} target="_blank" rel="noreferrer" className={linkCls}>
                    EEE issue tracker
                  </a>
                  .
                </li>
              </ul>
            </div>

            {/* RESEARCHERS */}
            <div className="border border-[color:var(--border-soft)] bg-[color:var(--bg-warm)] p-[22px]">
              <div className="kicker mb-2">Researchers</div>
              <ul className="m-0 list-disc space-y-2 pl-4 text-[13.5px] leading-[1.6] text-[color:var(--fg-muted)] marker:text-[color:var(--fg-subtle)]">
                <li>
                  Use Evaluation Cards in your model-, evaluation-, or field-level analysis — and{" "}
                  <Link href="/about#how-to-cite" className={linkCls}>
                    cite the paper
                  </Link>{" "}
                  when you build on it.
                </li>
                <li>
                  Report third-party results you've run to{" "}
                  <a href={EEE_SITE} target="_blank" rel="noreferrer" className={linkCls}>
                    Every Eval Ever
                  </a>{" "}
                  — independent numbers are first-class here.
                </li>
                <li>
                  Flag discrepancies or suggest methodology improvements on the{" "}
                  <a href={EEE_ISSUES} target="_blank" rel="noreferrer" className={linkCls}>
                    issue tracker
                  </a>{" "}
                  or in the{" "}
                  <a href={HF_DISCUSSIONS} target="_blank" rel="noreferrer" className={linkCls}>
                    discussions
                  </a>
                  .
                </li>
                <li>Spread the word — share it with collaborators and on socials.</li>
              </ul>
            </div>

            {/* POLICYMAKERS */}
            <div className="border border-[color:var(--border-soft)] bg-[color:var(--bg-warm)] p-[22px]">
              <div className="kicker mb-2">Policymakers</div>
              <ul className="m-0 list-disc space-y-2 pl-4 text-[13.5px] leading-[1.6] text-[color:var(--fg-muted)] marker:text-[color:var(--fg-subtle)]">
                <li>
                  Consult Evaluation Cards as an evidence base — what's documented, who reported it,
                  and how comparable it is.
                </li>
                <li>
                  <Link href="/about#how-to-cite" className={linkCls}>
                    Cite the paper
                  </Link>{" "}
                  in reports and briefings, and point colleagues to the site.
                </li>
                <li>
                  Tell us what evidence you need for decisions — suggest features on the{" "}
                  <a href={ROADMAP} target="_blank" rel="noreferrer" className={linkCls}>
                    public roadmap
                  </a>{" "}
                  or via the{" "}
                  <Link href="/feedback" className={linkCls}>
                    feedback form
                  </Link>
                  .
                </li>
                <li>Spread the word so more of the field reports legibly.</li>
              </ul>
            </div>
          </div>

          <p className="mt-5 text-[14px] leading-[1.7] text-[color:var(--fg-muted)]">
            Not sure where something fits? The{" "}
            <a href={ROADMAP} target="_blank" rel="noreferrer" className={linkCls}>
              public roadmap
            </a>
            , the{" "}
            <Link href="/feedback" className={linkCls}>
              feedback form
            </Link>
            , the{" "}
            <a href={EEE_ISSUES} target="_blank" rel="noreferrer" className={linkCls}>
              EEE issue tracker
            </a>
            , and the{" "}
            <a href={HF_DISCUSSIONS} target="_blank" rel="noreferrer" className={linkCls}>
              Space discussions
            </a>{" "}
            are always open.
          </p>
        </section>

        {/* HOW TO CITE ---------------------------------------------------- */}
        <section id="how-to-cite" className="mb-8 scroll-mt-24">
          <div className="section-head">
            <h2>How to cite</h2>
          </div>
          <CiteSection />
        </section>

        {/* CTA ROW -------------------------------------------------------- */}
        <section className="mt-12 flex flex-wrap gap-3 border-t border-[color:var(--border-soft)] pt-10">
          <ReplayIntroButton />
          <Link href="/" className="btn-ec outline">
            Back to home
          </Link>
          <Link href="/about" className="btn-ec outline">
            About Evaluation Cards
          </Link>
          <a href={PAPER_URL} target="_blank" rel="noreferrer" className="btn-ec outline">
            Read the paper
            <ExternalLink className="h-3.5 w-3.5" aria-hidden />
          </a>
        </section>
      </main>
    </div>
  )
}
