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

## 3) Technologies / Libraries

## 4) How to Use

- Drag & drop into the right panel, or
- Click “Drag & Drop” to choose a file, or
- Paste an image from the clipboard (Ctrl/Cmd+V)
- Blur Opacity: change blur intensity
- Feather: soften the edges (keeps full coverage; feathers outward)
- Filter: adjust sensitivity/threshold to include/exclude detections

## Deploy Options

### GitHub Pages (no credentials needed)

This repo includes two workflows:

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

## Portfolio / Case Study (suggested outline)

## Tests

The test suite (Vitest + Testing Library) exercises every stage of the redaction flow:

**Input & bootstrapping**

**Controls & surface area**

**Detectors & pipeline glue**

**Infrastructure**

Run the suite with `npm test` (use `npm run test:watch` for red-green TDD). Lint and type gates live under `npm run lint` and `npm run typecheck`.

**Coverage & badges**

## Recent Coverage Improvements

Focused utility suite added (face & plate blur helpers) to raise function coverage and lock in geometry, filtering, and parsing edge cases.

What was added:

- `face-blur-utils.ts` tests: clamp/grow math, CSS→canvas rect normalization, upward adjustment logic, feature‑flag guard (`isFaceApiNS`), and a smoke path for the feathered blur routine.
- `license-plate-blur-utils.ts` tests: IoU + NMS selection, strength→blur scaling, letterbox preprocessing dimensions, multiple YOLO output layout branches in `parseYolo`, confidence filtering, tensor row mapping helpers.

Impact (approximate deltas):

- Functions: 37.87% → 45.91%
- Branches: 63.47% → 66.80%
- Targeted utils function coverage now ~58–70% (previously near zero for many helpers).

Why overall coverage didn’t climb higher: large detector components (`FaceBlur.tsx`, `LicensePlateBlur.tsx`) and runtime glue (`face-detect.ts`) remain untested; they contain many small exported functions or inline logic that inflate the denominator.

Suggested next targets:

1. Add tests around `PrivacyScrubber` re-detection triggers (ensure sliders do not force detection; toggles do).
2. Introduce a hook (e.g. `useFaceDetections`) to isolate face detection post‑processing for direct unit tests.
3. Add a simple test for `download-canvas.ts` (link creation & cleanup) for quick function gains.
4. Extract cluster fusion / NMS logic from `face-detect.ts` into a pure helper module and test it.
5. Exclude vendored / build artifacts (docs/, public/lib/, ort runtime copies) from coverage if you want more representative app metrics.

Regenerate coverage: `npm run coverage:generate`

Update badges after changes: `npm run coverage:badge`

Feel free to trim or expand this section as coverage strategy evolves.

## License

Dual-licensed under either of:

- Apache License, Version 2.0 (see LICENSE-APACHE)
- MIT license (see LICENSE-MIT)

Unless you explicitly state otherwise, any contribution intentionally submitted
for inclusion in this project by you, as defined in the Apache-2.0 license,
shall be dual licensed as above, without any additional terms or conditions.
