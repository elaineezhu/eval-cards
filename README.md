---
title: Eval Cards
emoji: 📋
colorFrom: blue
colorTo: indigo
sdk: docker
pinned: false
app_port: 3000
short_description: Standardized evaluation cards for AI models and benchmarks
tags:
  - evaluation
  - benchmarks
  - ai-safety
  - visualization
---

# Eval Cards

This repository is a Next.js application for browsing derived model cards and evaluation views from the JSON files in `data/`. It provides a unified interface for inspecting reported AI evaluations, benchmark coverage, reporting provenance, and model-level evidence.

## Project Goals

The Eval Cards project aims to:
- **Standardize AI evaluation reporting** across different AI systems and models
- **Facilitate transparency** by providing detailed evaluation cards for AI systems
- **Enable comparative analysis** of AI capabilities and risks
- **Support research and policy** by consolidating evaluation data in an accessible format
- **Promote responsible AI development** through comprehensive risk assessment

## For External Collaborators

### Making Changes to Data and Views

The app is driven directly from the model JSON files in `data/`. Model pages, benchmark pages, and evaluation summaries are derived automatically from those files.

Key implementation areas:
- **`data/`** - Source-of-truth model JSON files
- **`lib/model-data.ts`** - Loads and normalizes model files
- **`lib/eval-processing.ts`** - Derives benchmark and evaluation summaries
- **`lib/benchmark-schema.ts`** - Shared app-facing types and summary shapes

### Standards and Frameworks Used

The evaluation framework is based on established standards:
- **Risk categories** are derived from **NIST AI 600-1** (AI Risk Management Framework)
- **Capability categories** are based on the **OECD AI Classification Framework**

This ensures consistency with international AI governance standards and facilitates interoperability with other evaluation systems.

### Contributing Evaluation Data

Evaluation data files are stored in `data/` as model JSON files. The frontend derives both the model view and the evaluation view automatically from those files.

To add a new evaluation:
1. Create a new JSON file in `data/`
2. Follow the existing model-file structure already used in `data/`
3. Ensure `model_info` and `evaluations` are populated
4. Reload the app to pick up the new model and derived evaluation summaries

### Development Setup

## Run locally

Install dependencies and run the dev server:

```bash
npm ci
npm run dev
```

Build for production and run:

```bash
npm ci
npm run build
NODE_ENV=production PORT=3000 npm run start
```

## Docker (recommended for Hugging Face Spaces)

A `Dockerfile` is included for deploying this app as a dynamic service on Hugging Face Spaces (Docker runtime).

Build the image locally:

```bash
docker build -t ai-eval-dashboard .
```

Run the container (expose port 3000):

```bash
docker run -p 3000:3000 -e HF_TOKEN="$HF_TOKEN" ai-eval-dashboard
```

Visit `http://localhost:3000` to verify.

### Deploy to Hugging Face Spaces

1. Create a new Space at https://huggingface.co/new-space and choose **Docker** as the runtime.
2. Push this repository to the Space Git (or upload files through the UI). The Space will build the Docker image using the included `Dockerfile` and serve your app on port 3000.

Notes:
- If your build needs native dependencies (e.g. `sharp`), the Docker image may require extra apt packages; update the Dockerfile accordingly. 
