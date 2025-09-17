# Photo Privacy Scrubber

[![Statements](https://img.shields.io/endpoint?url=https://raw.githubusercontent.com/dtaberer/photo-privacy/main/docs/badges/statements.json)](docs/badges/statements.json)
[![Branches](https://img.shields.io/endpoint?url=https://raw.githubusercontent.com/dtaberer/photo-privacy/main/docs/badges/branches.json)](docs/badges/branches.json)
[![Functions](https://img.shields.io/endpoint?url=https://raw.githubusercontent.com/dtaberer/photo-privacy/main/docs/badges/functions.json)](docs/badges/functions.json)
[![Lines](https://img.shields.io/endpoint?url=https://raw.githubusercontent.com/dtaberer/photo-privacy/main/docs/badges/lines.json)](docs/badges/lines.json)

Fast, privacy‑first redaction for faces and license plates — runs entirely in your browser. No uploads, no servers, no tracking. Paste, drag‑drop, or pick a photo; tune blur and feather; download the redacted result.

## Live Demo

Live Demo: https://dtaberer.github.io/photo-privacy

## 1) Screenshots

| Before                                                                                                                                 | After                                                                                                                            |
| -------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| <img src="https://raw.githubusercontent.com/dtaberer/photo-privacy/main/src/assets/before.jpg" alt="Before (demo image)" width="600"/> | <img src="https://raw.githubusercontent.com/dtaberer/photo-privacy/main/src/assets/after.jpg" alt="After (sample)" width="600"/> |

## Privacy

All detection runs on your device. Images never leave your machine. Models load from the same origin as the app and are cached locally by the browser.

## 2) Install & Run (step‑by‑step)

Prereqs

- Node.js 20+ and npm 10+

Install dependencies and fetch models/sidecars

```bash
git clone https://github.com/dtaberer/photo-privacy.git
cd photo-privacy
npm ci
# (postinstall runs model + ORT preparation; if scripts were skipped, run:)
npm run models:fetch
npm run ort:prep
```

Start the dev server

```bash
npm run dev
```

Run the test suite

```bash
npm test            # one‑shot
npm run test:watch  # watch mode
npm run lint        # ESLint
npm run typecheck   # TypeScript
```

## Features

- On‑device detection: no data leaves your machine
- License plates and faces with adjustable blur, feather, and confidence
- Paste, drag‑drop, and file picker
- Performance badges and timings
- Try‑Demo flow with a local sample image
- Accessible controls, keyboard‑friendly sliders, screen‑reader labels
- Thorough tests (Vitest + Testing Library)

## 3) Technologies / Libraries

- React 19 + Vite + TypeScript
- onnxruntime‑web for plates; FaceDetector API or face‑api.js fallback
- React‑Bootstrap for layout and controls
- Vitest + @testing‑library for tests

## 4) How to Use

- Load a photo:
  - Drag & drop into the right panel, or
  - Click “Drag & Drop” to choose a file, or
  - Paste an image from the clipboard (Ctrl/Cmd+V)
- Try the Demo: click the “Try the Demo” overlay in the preview to auto‑run detection and see tips
- Adjust sliders:
  - Blur Opacity: change blur intensity
  - Feather: soften the edges (keeps full coverage; feathers outward)
  - Filter: adjust sensitivity/threshold to include/exclude detections
- Download: click “Download” to save the composited, redacted image

## Deploy Options

### GitHub Pages (no credentials needed)

This repo includes two workflows:

- `.github/workflows/ci.yml` — lint, typecheck, test, build
- `.github/workflows/deploy-pages.yml` — builds and deploys `dist/` to Pages

Steps:

1. Push this repo to GitHub.
2. In GitHub: Settings → Pages → Build and deployment → Source: GitHub Actions.
3. Push to `main` or `master` — the deploy workflow publishes automatically.

Alternatively, you can serve from `main:/docs`:

```bash
npm run build
git add -A docs
git commit -m "publish: docs"
git push
# Repo Settings → Pages → Source: Deploy from a branch → Branch: main, Folder: /docs
```

### Vercel / Netlify

- Vercel: import the repo, framework = Vite, build = `npm run build`, output = `dist`.
- Netlify: build command = `npm run build`, publish directory = `dist`.

## Portfolio / Case Study (suggested outline)

- The problem: Easy, private image redaction without uploads
- Constraints: on‑device only, small bundle, fast perceived performance
- Solution: SIMD + 1‑thread fallback; onnxruntime‑web; accessible UI; robust tests
- Results: timings, lighthouse scores, coverage summary
- Lessons: perf trade‑offs, model sizing, UX decisions

## Tests

The test suite (Vitest + Testing Library) exercises every stage of the redaction flow:

**Input & bootstrapping**

- `src/__tests__/FileLoader.interaction.spec.tsx` – paste, drag-and-drop, and native file input events all surface a `File` to the pipeline; drop/paste edge-cases are stubbed in JSDOM.
- `src/__tests__/Preview.initial.spec.tsx` – the empty-state preview card renders with the correct sizing scaffolding before an image loads.
- `src/__tests__/Preview.layout.spec.tsx` – once an image URL exists, we ensure the `<img>`/`<canvas>` stack is mounted and ready for detection output.

**Controls & surface area**

- `src/__tests__/ActionControls.spec.tsx` – Scrub/Download buttons call through to their handlers and respect the busy state.
- `src/__tests__/ControlPanel.spec.tsx` – sliders convert UI input into the expected blur/confidence/feather values and call their state setters.
- `src/__tests__/SliderControl.test.tsx` – keyboard navigation, label formatting, and min/max bounds of the shared slider component.

**Detectors & pipeline glue**

- `src/__tests__/FaceBlur.spec.tsx` – mounts the face blur worker with mocked FaceDetector/face-api paths, asserting the exposed `BlurHandler` methods, redraw behaviour, and detection results.
- `src/__tests__/LicensePlateBlur.spec.tsx` – ONNX runtime is mocked so we can validate session setup, `run`, and `redraw` without loading real models.
- `src/__tests__/PrivacyScrubber.detect.spec.tsx` – full integration: uploading a photo, firing detection, toggling face/plate switches, and ensuring re-detection only happens when the UI expects it.
- `src/__tests__/refresh.calls.spec.tsx` – regression coverage that repeated “Refresh” clicks only invoke the detectors the correct number of times.

**Infrastructure**

- `src/__tests__/SetupTests.ts` configures the test DOM (canvas mocks, environment guards) so the rest of the suite can run without unsafe globals.

Run the suite with `npm test` (use `npm run test:watch` for red-green TDD). Lint and type gates live under `npm run lint` and `npm run typecheck`.

**Coverage & badges**

- Generate coverage locally with `npm run coverage:generate` (requires installing `@vitest/coverage-v8` once: `npm i -D @vitest/coverage-v8`).
- Refresh the JSON badge endpoints with `npm run coverage:badge`; the files live under `docs/badges/` and are read by the Shields.io badges above. For forks, update the badge URLs to match your GitHub repo path.

## License

Dual-licensed under either of:

- Apache License, Version 2.0 (see LICENSE-APACHE)
- MIT license (see LICENSE-MIT)

Unless you explicitly state otherwise, any contribution intentionally submitted
for inclusion in this project by you, as defined in the Apache-2.0 license,
shall be dual licensed as above, without any additional terms or conditions.
