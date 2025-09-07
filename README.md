# Photo Privacy Scrubber

Fast, privacy‑first redaction for faces and license plates — runs entirely in your browser. No uploads, no servers, no tracking. Paste, drag‑drop, or pick a photo; tune blur and feather; download the redacted result.

## Live Demo

Live Demo: https://dtaberer.github.io/photo-privacy

## 1) Screenshots

| Before                                                                                                              | After                                                                                                             |
| ------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| <img src="https://raw.githubusercontent.com/dtaberer/photo-privacy/main/src/assets/demo1.jpg" alt="Before (demo image)" width="600"/> | <img src="https://raw.githubusercontent.com/dtaberer/photo-privacy/main/src/assets/demo2.jpg" alt="After (sample)" width="600"/> |

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

Tests added for interaction and layout behavior:

- `src/__tests__/FileLoader.interaction.spec.tsx` — paste, drag‑drop, input change
- `src/__tests__/Preview.initial.spec.tsx` — initial height/classes before image load
- Existing: action buttons, controls, refresh/detect flows, slider behaviors

Run them locally with `npm test`.

## License

Dual-licensed under either of:

- Apache License, Version 2.0 (see LICENSE-APACHE)
- MIT license (see LICENSE-MIT)

Unless you explicitly state otherwise, any contribution intentionally submitted
for inclusion in this project by you, as defined in the Apache-2.0 license,
shall be dual licensed as above, without any additional terms or conditions.
