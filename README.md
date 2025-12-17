---
title: Eval Cards
emoji: 📋
colorFrom: blue
colorTo: cyan
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

This repository is a Next.js application for viewing and authoring AI evaluations. It provides a comprehensive platform for documenting and sharing AI system evaluations across multiple dimensions including capabilities and risks.

## Project Goals

The Eval Cards project aims to:
- **Standardize AI evaluation reporting** across different AI systems and models
- **Facilitate transparency** by providing detailed evaluation cards for AI systems
- **Enable comparative analysis** of AI capabilities and risks
- **Support research and policy** by consolidating evaluation data in an accessible format
- **Promote responsible AI development** through comprehensive risk assessment

## For External Collaborators

### Making Changes to Evaluation Categories and Schema

All evaluation categories, form fields, and data structures are centrally managed in the `schema/` folder. **This is the primary location for making structural changes to the evaluation framework.**

Key schema files:
- **`schema/evaluation-schema.json`** - Defines all evaluation categories (capabilities and risks)
- **`schema/output-schema.json`** - Defines the complete data structure for evaluation outputs
- **`schema/system-info-schema.json`** - Defines form field options for system information
- **`schema/category-details.json`** - Contains detailed descriptions and criteria for each category
- **`schema/form-hints.json`** - Provides help text and guidance for form fields

### Standards and Frameworks Used

The evaluation framework is based on established standards:
- **Risk categories** are derived from **NIST AI 600-1** (AI Risk Management Framework)
- **Capability categories** are based on the **OECD AI Classification Framework**

This ensures consistency with international AI governance standards and facilitates interoperability with other evaluation systems.

### Contributing Evaluation Data

Evaluation data files are stored in `public/benchmarks/` as JSON files. Each file represents a complete evaluation of an AI system and must conform to the schema defined in `schema/output-schema.json`.

To add a new evaluation:
1. Create a new JSON file in `public/benchmarks/`
2. Follow the structure defined in `schema/output-schema.json`
3. Ensure all required fields are populated
4. Validate against the schema before submission

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