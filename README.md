# Table Image Detector

Initial delivery based on `plan.md` focused on:
- Docker-ready mono-repo (`frontend` + `backend`)
- Backend Node.js crawler with Playwright
- Frontend starter to create jobs and poll progress
- SVG images ignored at crawl stage

## Quick Start

1. Copy `.env.example` values if needed.
2. Run:

```bash
docker-compose up --build
```

3. Open [http://localhost:3000](http://localhost:3000)
4. Submit a website URL in the form.

## Troubleshooting

- If UI says `Could not reach backend`, verify backend is running on `http://localhost:4000` (local) or that Docker Compose sets `BACKEND_URL=http://backend:4000` for frontend.
- Backend now logs every request and uncaught route error with stack traces to help diagnose `500` responses.

## What is implemented now

- `POST /api/jobs` creates a crawl job
- `GET /api/jobs/:id` returns progress and discovered images
- `DELETE /api/jobs/:id` removes a job
- Crawler limits:
  - `maxPages`
  - `maxDepth`
  - same-domain links only
  - page timeout

## Next steps

Follow `CHECKLIST.md`:
- OCR filter with `tesseract.js`
- ONNX TATR detector
- richer UI with verdicts and overlays
