# Cross-post Every Eval Ever results to Hugging Face

*Send an Every Eval Ever (EEE) record to Hugging Face Community Evals so your score shows up on the model page, with a backlink to the full structured record.*

> **Audience:** contributors who already report evaluation results to [Every Eval Ever](https://github.com/evaleval/every_eval_ever). This is the more technical companion to the stakeholder guides.

---

## Why this exists

Every Eval Ever (EEE) launched in February 2026 as a project of the EvalEval Coalition, a cross-institutional effort to fix how AI evaluation results get reported. Eval results matter for capability measurement, safety, and governance, yet they are scattered and hard to compare: they live in papers, leaderboards, blog posts, and harness logs, each in its own format, and the same model on the same benchmark often returns different numbers depending on who ran it and how.

LLaMA 65B, for example, has been reported at both **63.7** and **48.8** on MMLU. That gap came down to the evaluation harness, not the model, and usually you can't even see a gap like that, because the metadata that would explain it isn't recorded.

EEE is the fix for the reporting side: **one JSON schema** for an evaluation result that records who ran it, which model, how it was accessed, the generation settings, and what the metric actually means, with an optional companion file for per-sample outputs. It takes in results from any source, so harness logs, leaderboard scrapes, and paper numbers all end up in the same shape. Since launching, the datastore on Hugging Face has grown to around **229,000 evaluation results** across more than **22,000 models** and **2,200 benchmarks**, pulled from **31** different reporting formats. Reproducing those runs from scratch would cost somewhere in the hundreds of thousands of dollars, a reasonable argument for not letting the data scatter once someone has paid to generate it.

## What cross-posting does

You can now send your EEE results to **Hugging Face Community Evals** for official benchmarks. A converter takes an EEE record and writes the small YAML file Hugging Face expects, so you don't have to maintain the same result in two formats by hand.

Once you share, two things happen:

- Your score **appears on the Hugging Face model page** and is pulled into the benchmark's leaderboard.
- It carries a **source badge that links back to the full EEE record**, where the generation config, harness version, reproducibility notes, and any instance-level data live.

The two destinations do different jobs toward the same goal. Hugging Face puts your result where people look at models, with a link back to the source. EEE keeps the full structured record that makes the result interpretable, and powers Evaluation Cards on top of it. Send your data to both and the same evaluation ends up visible and legible at once, which is the point of reporting one at all.

## How it works

Hugging Face stores eval scores in the model repo, as a YAML file under `.eval_results/`. The required fields are just the benchmark dataset, the task, and the value. The `source` block is optional, and it's the part that creates the backlink to EEE.

```yaml
- dataset:
    id: openai/gsm8k
    task_id: gsm8k
  value: 96.8
  date: '2024-07-16'
  notes: '8-shot CoT'
  source:
    url: https://huggingface.co/datasets/evaleval/EEE_datastore/blob/main/data/gsm8k/<dev>/<model>/<uuid>.json
    name: EvalEval
```

The converter fills this in from your existing record. It maps:

| EEE field | Hugging Face YAML field |
|---|---|
| `source_data.hf_repo` | `dataset.id` |
| `evaluation_name` | `task_id` |
| `score_details.score` | `value` |
| `evaluation_timestamp` | `date` |

…then drops in the `source` link to the per-record EEE JSON. It **skips any model repo that already has a YAML for the same dataset and task**, so re-running it won't open duplicate PRs.

## Start here

If you already contribute to EEE, this is one extra step and the converter handles most of it:

1. Submit your full record to the EEE datastore the usual way; the [GitHub repo](https://github.com/evaleval/every_eval_ever) has the contributor guide and converters.
2. Run the converter to generate the Hugging Face YAML.
3. Open the PR on the model's **Community** tab.

---

*Adapted from "Cross-post your Every Eval Ever results onto Hugging Face model pages," by Netaluru Harsha, Nathan Habib, and Avijit Ghosh.*
