# Evaluation Cards — Quickstart

*A stakeholder-agnostic guide to getting started. ~10 minutes.*

> 🖼️ **Screenshot — `01-home-overview.png`**
> *What to capture:* The full homepage at <https://evalcards.evalevalai.com> showing the headline, the **Corpus snapshot**, and the four interpretive signals.

---

## What Evaluation Cards is

**Evaluation Cards** is a reporting layer over AI model evaluations, built by the [EvalEval Coalition](https://evalcards.evalevalai.com/about). It collects how AI models are evaluated across many benchmarks and reporting organizations, and — just as importantly — shows **what was left undocumented**.

A benchmark score on its own ("Model X scores 87% on MMLU") tells you very little. Evaluation Cards puts each score in context: *who* ran the evaluation, *how* it was set up, *whether* it can be reproduced, and *whether* it can be fairly compared to another score. The project treats every published evaluation as a **claim**, and every undisclosed detail as **a claim deliberately not made** — neither is treated as an error.

At a glance (snapshot of June 2026), the corpus tracks:

| | |
|---|---|
| **5,816** models | **101,955** reported results |
| **31** reporting organizations | **820** model developers |
| **57** benchmark families | **638** single benchmarks |

> The corpus is **versioned by snapshot**. Every page shows a snapshot date. Numbers above will drift as the corpus grows — always cite the snapshot you saw.

---

## The four interpretive signals

Every record is assessed against four signals. These are the heart of the site — learn to read them and the rest follows.

> 🖼️ **Screenshot — `03-home-signals.png`**
> *What to capture:* The "Interpretive signals" section on the homepage (the four cards: Reproducibility, Completeness, Provenance, Comparability).

| Signal | Question it answers | What a low score means |
|---|---|---|
| **R — Reproducibility** | Could a third party re-run this evaluation? | Prompts, decoding settings, harness version, seeds, or code are undisclosed. |
| **C — Completeness** | Does the record meet normal reporting expectations for this kind of model? | Whole categories (e.g. safety, robustness, fairness) may be missing. |
| **P — Provenance & Risk** | Who ran it, and what real-world property does it measure? | Distinguishes **first-party** (the developer) from **third-party** (independent) evaluators. |
| **X — Comparability** | Can two scores on the same benchmark be put side by side? | Different slices, metric variants, or units make a direct ranking invalid. |

A high benchmark score with weak signals is still a weak claim. The signals are how you tell a well-documented result from a number with no paper trail.

---

## The five-level hierarchy

Scores resolve through an explicit pathway, so any headline number can be drilled down to the evidence behind it:

```
Family  →  Composite  →  Single Benchmark  →  Slice  →  Metric
```

For example: *MMLU (family) → MMLU-Pro (composite) → a single subject → a language/subset slice → accuracy (metric)*. When you see an aggregate claim, you can always click down to the specific metric supporting it.

---

## Getting around: the four pages

> 🖼️ **Screenshot — `02-home-hero.png`**
> *What to capture:* The top navigation bar (Overview · Models · Evaluations · About).

1. **Overview** (`/`) — the corpus snapshot, the signals explained, and featured benchmark families. Start here.
2. **Models** (`/models`) — every indexed model. Filter by parameter size, switch between **Models** and **Developers** views, and select up to four models to compare.
3. **Evaluations** (`/evals`) — benchmarks grouped into **families**, filterable by interaction style (agent / non-agent) and ~17 categories (Mathematics, Safety, Software Engineering, …).
4. **About** (`/about`) — the methodology: how the signals are computed and the principles behind the corpus.

---

## Your first 5 minutes

1. **Open a model card.** Go to **Models**, click any model (e.g. *Claude Opus 4.7*). This is an *Evaluation Card*.

   > 🖼️ **Screenshot — `13-card-summary-full.png`**
   > *What to capture:* A full model Evaluation Card in **Summary View** (e.g. `/models/anthropic/claude-opus-4.7`).

2. **Read the `DOCUMENTED` badge.** Near the top, a percentage (e.g. "36% — 14 / 39 reported") tells you how much of this model's reported record is fully documented. Low is common; that's the point.

3. **Check "Who reports what" (§3).** A donut and per-category bars split results into **first-party** (the developer's own numbers) vs **third-party** (independent). This is your fastest read on how independent the evidence is.

   > 🖼️ **Screenshot — `17-card-who-reports.png`**
   > *What to capture:* The §3 "Who reports what" section of a model card (first-party vs third-party breakdown).

4. **Toggle Summary View → Researcher View.** The top-right toggle exposes the underlying per-result detail. Summary is for orientation; Researcher is for digging in.

   > 🖼️ **Screenshot — `19-card-researcher-full.png`**
   > *What to capture:* The same model card after clicking **Researcher View**.

5. **Note the snapshot date** before you cite anything.

---

## Three things to remember

- **A score is a claim, not a fact.** Read the signals before trusting the number.
- **First-party ≠ third-party.** Always check who produced a result.
- **Cite the snapshot.** The corpus is versioned; numbers change.

➡️ **Next:** pick the guide for your role — [Evaluation researchers](evaluation-researchers.md) · [Policymakers](policymakers.md) · [General public](general-public.md) · [Journalists](journalists.md).
