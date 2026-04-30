# Table Image Detector Checklist

## Phase 1 - Setup and Infrastructure
- [x] Initialize monorepo structure (`frontend`, `backend`, `data`)
- [x] Add Docker Compose with 2 services (`frontend`, `backend`)
- [x] Add backend Dockerfile (Node + Playwright Chromium deps)
- [x] Add frontend Dockerfile (Next.js multi-stage build)
- [x] Define shared data volume (`app_data`) mounted at `/data`
- [x] Provide `.env.example` with core runtime variables

## Phase 2 - Backend Web Crawler (Current Delivery)
- [x] Bootstrap Node.js + TypeScript Express API
- [x] Implement job lifecycle (`create`, `read`, `delete`) in memory
- [x] Implement Playwright crawl service
- [x] Restrict crawling to same domain and configurable depth/pages
- [x] Extract only raster image tags (`img`) and ignore SVG assets
- [x] Persist crawl metadata and progress for frontend polling

## Phase 3 - Frontend Baseline (Current Delivery)
- [x] Bootstrap Next.js App Router + TypeScript UI
- [x] Create URL/options form to start jobs
- [x] Add polling status panel with progress counters
- [x] Add initial results list for discovered images
- [x] Add API route proxy to backend for browser-safe calls

## Phase 4 - OCR Filter (`tesseract.js`)
- [x] Add OCR worker initialization and lifecycle management
- [x] Add OCR pass/fail thresholds (min words + confidence)
- [x] Store OCR text previews in job results

## Phase 5 - Table Detection (`onnxruntime-node`)
- [x] Add ONNX model download/cache manager
- [x] Add image preprocessing utilities (`jimp` to tensor)
- [x] Add TATR inference service and post-processing
- [x] Merge table detection output into job results

## Phase 6 - UX and Reliability
- [ ] Add result filters/sorting and bounding-box overlays
- [ ] Add robust cancellation, retries, and timeout handling
- [ ] Add job cleanup policy for stale artifacts
- [ ] Add integration tests and documentation hardening
