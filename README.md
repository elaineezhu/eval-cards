---
title: AI Evaluation Dashboard
emoji: 📊
colorFrom: blue
colorTo: indigo
sdk: docker
pinned: false
app_port: 3000
---

# AI Evaluation Dashboard

This repository is a Next.js application for viewing and authoring AI evaluations. It includes demo evaluation fixtures under `public/evaluations/` and a dynamic details page that performs server-side rendering and route-handler based inference.

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
2. Add a secret named `HF_TOKEN` (if you plan to access private or gated models or the Inference API) in the Space settings.
3. Push this repository to the Space Git (or upload files through the UI). The Space will build the Docker image using the included `Dockerfile` and serve your app on port 3000.

Notes:
- The app's server may attempt to construct ML pipelines server-side if you use Transformers.js and large models; prefer small/quantized models or use the Hugging Face Inference API instead (see below).
- If your build needs native dependencies (e.g. `sharp`), the Docker image may require extra apt packages; update the Dockerfile accordingly.

## Alternative: Use Hugging Face Inference API (avoid hosting model weights)

If downloading and running model weights inside the Space is impractical (memory/disk limits), modify the server route to proxy requests to the Hugging Face Inference API.

Example server-side call (Route Handler):

```js
const resp = await fetch('https://api-inference.huggingface.co/models/<model-id>', {
  method: 'POST',
  headers: { Authorization: `Bearer ${process.env.HF_TOKEN}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({ inputs: text })
})
const json = await resp.json()
```

Store `HF_TOKEN` in the Space secrets and your route will be able to call the API.

## Troubleshooting

- Build fails in Spaces: check the build logs; you may need extra apt packages or to pin Node version.
- Runtime OOM / killed: model is too large for Spaces; use Inference API or smaller models.

## What I added

- `Dockerfile` — multi-stage build for production
- `.dockerignore` — to reduce image size
- Updated `README.md` with Spaces frontmatter and deployment instructions

If you want, I can:
- Modify the Dockerfile to use Next.js standalone mode for a smaller runtime image.
- Add a small health-check route and a simple `docker-compose.yml` for local testing.

Which of those would you like next?
npm run build

Send the contents of the "out" folder to https://huggingface.co/spaces/evaleval/general-eval-card
