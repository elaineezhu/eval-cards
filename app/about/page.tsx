import Link from "next/link"
import { ArrowRight, ExternalLink } from "lucide-react"

import { CiteSection, PAPER_URL } from "@/components/cite-section"
import { Navigation } from "@/components/navigation"

export default function AboutPage() {
  return (
    <div className="min-h-screen bg-background">
      <Navigation />

      <main className="mx-auto w-full max-w-[64rem] px-4 pb-24 pt-12 sm:px-8">
        {/* HEADER --------------------------------------------------------- */}
        <div className="kicker">About</div>
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
          A reporting layer for AI evaluation.
        </h1>
        <p className="mb-6 text-[19px] leading-[1.6] text-[color:var(--fg-muted)]">
          <strong className="text-[color:var(--fg)] font-semibold">Evaluation Cards</strong> is a
          structured collection of how AI models are evaluated — and, just as importantly, of
          what is left undocumented. It composes existing evaluation infrastructure into a
          single audience-agnostic reading surface. It is a research artifact of the{" "}
          <strong className="text-[color:var(--fg)] font-semibold">EvalEval Coalition</strong>,
          a community of academic and industrial labs working on broader-impact evaluation of
          AI systems.
        </p>
        <p className="mb-5 text-base leading-[1.75] text-[color:var(--fg)]">
          Benchmark scores are routinely reported without the context required to interpret
          them: prompts, decoding parameters, evaluator identity, reproduction artifacts,
          scope of validity. Evaluation Cards treats every published evaluation as a{" "}
          <em>claim</em>, and every absent field as a claim <em>not made</em>. Neither is an
          error — the distinction is what makes the public record useful.
        </p>

        {/* BUILT ON ------------------------------------------------------- */}
        <section className="mb-14">
          <div className="section-head">
            <h2>What it is built on</h2>
          </div>
          <div className="grid gap-5 sm:grid-cols-2">
            {[
              [
                "Auto-BenchmarkCards",
                "A schema for benchmark-level metadata — what a benchmark measures, its splits, intended use, validity scope, and known limitations. Each benchmark family has an Auto-BenchmarkCard at the family root and a Policy Note compressed for plain-language reading.",
              ],
              [
                "Every Eval Ever",
                "A run-level corpus of public evaluation results — (model, benchmark, metric-path, value, source) tuples extracted from papers, model cards and leaderboards. Provides the raw rows that Evaluation Cards canonicalises and joins.",
              ],
              [
                "IBM Risk Atlas alignment",
                "Risk-domain annotations on benchmarks (capability, robustness, safety, agentic risk, fairness) so policy readers can locate which deployment-relevant property a number speaks to.",
              ],
              [
                "Five-level hierarchy",
                "Family → Composite → Single benchmark → Slice → Metric. Every score resolves to an explicit path, so aggregate claims drill down to the evidence supporting them.",
              ],
            ].map(([h, p]) => (
              <div
                key={h}
                className="border border-[color:var(--border-soft)] bg-[color:var(--bg-warm)] p-[22px]"
              >
                <h3 className="m-0 mb-2 text-base font-semibold tracking-[-0.005em] text-[color:var(--fg)]">
                  {h}
                </h3>
                <p className="m-0 text-[13.5px] leading-[1.6] text-[color:var(--fg-muted)]">
                  {p}
                </p>
              </div>
            ))}
          </div>
        </section>

        {/* TWO READER MODES ---------------------------------------------- */}
        <section className="mb-14">
          <div className="section-head">
            <h2>Two reader modes, one record</h2>
          </div>
          <p className="mb-5 max-w-[700px] text-[15px] leading-[1.7] text-[color:var(--fg-muted)]">
            The same evaluation record renders differently depending on the question the
            reader brings to it. Toggle in the topbar; the URL, the data and the citations
            are unchanged.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 border border-[color:var(--border-soft)]">
            <div className="p-6 sm:border-r border-[color:var(--border-soft)]">
              <div className="kicker mb-2">Research</div>
              <h3 className="m-0 mb-2.5 text-lg font-semibold text-[color:var(--fg)]">
                Methodology read
              </h3>
              <p className="m-0 text-[13.5px] leading-[1.65] text-[color:var(--fg-muted)]">
                Setup variants, n-shot, decoding parameters, evaluator identity, confidence
                intervals, and the specific schema fields missing for reproduction are
                foregrounded on every metric row.
              </p>
            </div>
            <div className="p-6 bg-[color:var(--fg)] text-[color:var(--bg)]">
              <div className="kicker mb-2" style={{ color: "var(--accent)" }}>
                Summary view
              </div>
              <h3 className="m-0 mb-2.5 text-lg font-semibold">Plain-language read</h3>
              <p className="m-0 text-[13.5px] leading-[1.65]" style={{ color: "color-mix(in srgb, var(--bg) 78%, transparent)" }}>
                An "at a glance" card (measures · caveat · intended for), risk-domain annotations,
                first/third-party evaluator tags, and disclosure-gap flags are foregrounded;
                metric configuration is compressed.
              </p>
            </div>
          </div>
        </section>

        {/* FOUR SIGNALS --------------------------------------------------- */}
        <section id="four-interpretive-signals" className="mb-14 scroll-mt-24">
          <div className="section-head">
            <h2>Four interpretive signals</h2>
          </div>
          <p className="mb-5 max-w-[720px] text-[15px] leading-[1.7] text-[color:var(--fg-muted)]">
            The four signals come from a question that kept coming up in our interviews with
            researchers and policy practitioners: do I have enough information to trust this
            result as a basis for a decision? Each one answers a different part of it. They're
            computed for every{" "}
            <code className="font-mono text-[12px]">(model, benchmark, metric-path)</code> record
            and rolled up across the corpus — you'll see them on each model and benchmark page,
            and the corpus-wide picture on the home page. For the exact formulas, see the{" "}
            <Link href="/help/how-signals-are-computed" className="underline underline-offset-2">
              signal computation reference
            </Link>
            .
          </p>
          <ol className="list-none p-0 m-0">
            {[
              {
                id: "reproducibility",
                name: "Reproducibility",
                question: "Could someone else re-run this and get the same number?",
                body: "We check for the small set of fields you'd need to reproduce a run — temperature and max tokens, plus the harness, evaluation plan, and limits for agentic evaluations. If any are missing, the result is flagged and the specific missing fields are listed.",
                meta: "Per (model, benchmark, metric-path) · flag + missing-field list",
              },
              {
                id: "completeness",
                name: "Reporting completeness",
                question: "Is the score documented well enough to interpret?",
                body: "This looks at the full 28-field schema around a benchmark — its goals, construct definitions, scoring rubric, intended uses, and known limitations — not just the handful of fields needed to re-run it. Present fields score 1, fields with sub-items score the fraction filled in, and the completeness score is the average. It measures how much is documented, not how rigorous the work was.",
                meta: "Per benchmark · score 0–1 + missing-field count",
              },
              {
                id: "provenance",
                name: "Provenance & risk",
                question: "Who reported it, and what's at stake?",
                body: "For each score we surface who ran it — the model developer (first-party), an independent evaluator (third-party), or a collaboration — and whether more than one party reported the same thing. We also carry over any risk categories tied to the benchmark, drawn from the Auto-BenchmarkCards risk mapping. First- and third-party results are never quietly merged.",
                meta: "Per (model, benchmark, metric-path) · party tag + multi-party flag + risk tags",
              },
              {
                id: "comparability",
                name: "Comparability",
                question: "Can these scores actually be compared?",
                body: "When the same model, benchmark, and metric has more than one reported score, we check whether they differ by more than 5% of the metric's range — both across different setups from the same party (variant divergence) and across different parties (cross-party divergence). If they diverge, we flag it and show the setup differences behind the gap.",
                meta: "Per (model, benchmark, metric-path), ≥2 reports · variant + cross-party divergence flags",
              },
            ].map((s, i) => (
              <li
                key={s.id}
                id={`signal-${s.id}`}
                className="grid grid-cols-[50px_1fr] gap-5 border-b border-[color:var(--border-soft)] py-5 scroll-mt-24"
              >
                <span
                  className="font-mono"
                  style={{
                    fontSize: 11,
                    color: "var(--accent)",
                    letterSpacing: "0.1em",
                  }}
                >
                  0{i + 1}
                </span>
                <div>
                  <h3 className="m-0 text-[17px] font-semibold text-[color:var(--fg)]">
                    {s.name}
                  </h3>
                  <p className="mt-0.5 m-0 text-[13.5px] italic leading-[1.5] text-[color:var(--fg-subtle)]">
                    {s.question}
                  </p>
                  <p className="mt-2 m-0 text-sm leading-[1.65] text-[color:var(--fg-muted)]">
                    {s.body}
                  </p>
                  <p className="mt-2.5 m-0 font-mono text-[11px] uppercase tracking-[0.08em] text-[color:var(--fg-subtle)]">
                    {s.meta}
                  </p>
                </div>
              </li>
            ))}
          </ol>
          <p className="mt-5 max-w-[720px] text-sm leading-[1.7] text-[color:var(--fg-muted)]">
            None of this is a grade. Evaluation Cards doesn't hand out letter grades, pass/fail
            thresholds, or rankings — it just makes reporting choices visible. A missing field
            lowers a completeness score and may trip another signal, and we show readers exactly
            what was left out.
          </p>
        </section>

        {/* READER MODES --------------------------------------------------- */}
        <section className="mb-14">
          <div className="section-head">
            <h2>Reader modes</h2>
          </div>
          <p className="mb-5 max-w-[700px] text-[15px] leading-[1.7] text-[color:var(--fg-muted)]">
            Every model and benchmark page can be read at two levels of detail. The underlying
            data is the same; the toggle controls how much of it is foregrounded.
          </p>
          <div className="grid gap-5 sm:grid-cols-2">
            <div className="border border-[color:var(--border-soft)] p-[22px]">
              <div className="kicker mb-2">Summary view</div>
              <p className="m-0 text-[14px] leading-[1.65] text-[color:var(--fg-muted)]">
                Default. Plain-language interpretation for non-technical readers — policymakers,
                journalists, decision-makers. An "at a glance" card foregrounds what the
                benchmark measures, its main caveat, and who it's for; technical detail is
                tucked into collapsed sections below.
              </p>
            </div>
            <div className="border border-[color:var(--border-soft)] p-[22px]">
              <div className="kicker mb-2">Researcher view</div>
              <p className="m-0 text-[14px] leading-[1.65] text-[color:var(--fg-muted)]">
                For technical researchers. Foregrounds methodology and configuration —
                specific missing fields, setup-variant differences, expanded metric configuration,
                and the full benchmark card.
              </p>
            </div>
          </div>
        </section>

        {/* METHODOLOGY ---------------------------------------------------- */}
        <section className="mb-14">
          <div className="section-head">
            <h2>Methodology</h2>
          </div>
          <ol className="list-none p-0 m-0">
            {[
              [
                "Canonicalisation",
                "Heterogeneous score reports — papers, model cards, leaderboards, blog posts — are normalised to (model, benchmark, slice, metric, value, source) tuples. Model name aliases and benchmark version aliases are resolved against a curated mapping.",
              ],
              [
                "Source attribution",
                "Each record cites the document of record with a line reference. Where multiple sources report the same configuration, the developer's primary source is preferred and discrepancies are flagged.",
              ],
              [
                "Evaluator identity",
                "Two categories only: first-party (the model developer) and third-party (an independent evaluator). The two are tagged distinctly and never silently merged; if both have reported on a (model, benchmark) pair, both rows appear separately.",
              ],
              [
                "No imputation",
                "Empty cells are empty. Evaluation Cards never estimates, infers, or cross-fills missing values. Disclosure gaps are surfaced as such.",
              ],
              [
                "Snapshot discipline",
                "Each release is a dated snapshot. Numbers are not back-edited; corrections add a new version with provenance preserved.",
              ],
            ].map(([h, p], i) => (
              <li
                key={h}
                className="grid grid-cols-[50px_1fr] gap-5 border-b border-[color:var(--border-soft)] py-5"
              >
                <span
                  className="font-mono"
                  style={{
                    fontSize: 11,
                    color: "var(--fg-subtle)",
                    letterSpacing: "0.1em",
                  }}
                >
                  M.{i + 1}
                </span>
                <div>
                  <h3 className="m-0 text-[17px] font-semibold text-[color:var(--fg)]">{h}</h3>
                  <p className="mt-1.5 m-0 text-sm leading-[1.65] text-[color:var(--fg-muted)]">
                    {p}
                  </p>
                </div>
              </li>
            ))}
          </ol>
        </section>

        {/* PRINCIPLES ----------------------------------------------------- */}
        <section className="mb-14">
          <div className="section-head">
            <h2>Principles</h2>
          </div>
          <ol className="list-none p-0 m-0">
            {[
              [
                "We do not impute.",
                "If a developer did not publish a score, the cell is empty. We do not estimate, infer, or cross-fill.",
              ],
              [
                "Every number cites its source.",
                "Each reported score resolves to a specific document — paper, model card, blog post — with a line reference.",
              ],
              [
                "Evaluator identity matters.",
                "First-party and third-party results are visually distinct and never silently merged. When both have reported on the same (model, benchmark) pair, both rows are kept side by side.",
              ],
              [
                "Gaps are data.",
                "Undisclosed fields appear alongside disclosed ones. Silence about a safety benchmark is itself information.",
              ],
              [
                "Aggregates resolve to evidence.",
                "Every corpus-level claim drills down to the (model, benchmark, metric-path) records that support it. No black-box scores.",
              ],
              [
                "Corrections are welcome.",
                "Each record links a correction path. Evaluation Cards is a living artifact; coverage improves as developers publish.",
              ],
            ].map(([h, p], i) => (
              <li
                key={i}
                className="grid grid-cols-[60px_1fr] gap-6 border-b border-[color:var(--border-soft)] py-6"
              >
                <span
                  className="font-mono"
                  style={{
                    fontSize: 12,
                    color: "var(--accent)",
                    letterSpacing: "0.1em",
                  }}
                >
                  0{i + 1}
                </span>
                <div>
                  <h3 className="m-0 text-xl font-semibold text-[color:var(--fg)]">{h}</h3>
                  <p className="mt-2 m-0 text-[15px] leading-[1.65] text-[color:var(--fg-muted)]">
                    {p}
                  </p>
                </div>
              </li>
            ))}
          </ol>
        </section>

        {/* OUT OF SCOPE --------------------------------------------------- */}
        <section className="mb-14">
          <div className="section-head">
            <h2>What Evaluation Cards does not do</h2>
          </div>
          <ul className="list-none p-0 m-0 text-[14.5px] leading-[1.75]">
            {[
              "Produce a single capability ranking. Metrics across benchmarks are heterogeneous and not commensurable; rolling them into one score throws away the information that makes evaluation useful.",
              "Evaluate models. Evaluation Cards reports on what others have already evaluated. New runs go through the upstream Every Eval Ever pipeline, not this surface.",
              "Endorse a benchmark. Inclusion is a statement about disclosure prevalence, not benchmark quality. Each benchmark's 'at a glance' card surfaces its main caveat; reading it is part of using Evaluation Cards.",
              "Replace model cards or system cards. Evaluation Cards complements them — it is the cross-model, cross-benchmark reading surface that individual cards alone cannot provide.",
            ].map((t, i) => (
              <li
                key={i}
                className="grid grid-cols-[24px_1fr] gap-4 border-b border-[color:var(--border-soft)] py-3.5 text-[color:var(--fg-muted)]"
              >
                <span className="font-mono text-[color:var(--fg-subtle)]">—</span>
                <span>{t}</span>
              </li>
            ))}
          </ul>
        </section>

        {/* HOW TO CITE ---------------------------------------------------- */}
        <section id="how-to-cite" className="mb-8 scroll-mt-24">
          <div className="section-head">
            <h2>How to cite</h2>
          </div>
          <CiteSection showCorrection />
        </section>

        {/* CTA ROW -------------------------------------------------------- */}
        <section className="mt-12 flex flex-wrap gap-3 border-t border-[color:var(--border-soft)] pt-10">
          <Link href="/" className="btn-ec">
            Back to home
            <ArrowRight className="h-3.5 w-3.5" aria-hidden />
          </Link>
          <Link href="/models" className="btn-ec outline">
            Browse models
          </Link>
          <Link href="/evals" className="btn-ec outline">
            Browse evaluations
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
