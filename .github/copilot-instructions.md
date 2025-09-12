## Copilot instructions for this repo

Purpose: React + Vite + TypeScript app for on-device face and license-plate redaction using onnxruntime-web (WASM). Built to `docs/` for GitHub Pages.

Architecture (what matters)

- Entry `src/main.tsx`: call `setupOrt()` first; load `bootstrap.min.css` before our styles; render `App`.
- ORT setup `src/ort-setup.ts`: sets `ort.env.wasm` and `wasmPaths` to `BASE_URL + /ort-runtime/`. Use `createOrtSession()` instead of raw ORT.
- App flow `components/PrivacyScrubber.tsx`: owns image/canvas, wires detectors via `ref`s implementing `BlurHandler { run, redraw, getDetections, reset }`.
- Detectors: Plates in `components/LicensePlateBlur.tsx` (YOLO-ish ONNX); Faces in `components/FaceBlur.tsx` with fallback chain: FaceDetector API → ONNX (`components/utils/face-detector-onnx.ts` → `runtime/face-detect.ts`) → `face-api.js`.
- Config/constants: `components/constants.ts` builds model URLs from `import.meta.env.BASE_URL`; shared types live in `types/detector-types.ts`.

Workflows

- Install: `npm ci` (postinstall runs `scripts/fetch-face-models.mjs` and `scripts/prepare-ort-sidecars.mjs`). If skipped: `npm run models:fetch && npm run ort:prep`.
- Dev: `npm run dev` (or `npm run dev:reset` to clear Vite cache and re-prepare ORT).
- Test: `npm test` (Vitest + jsdom). `src/__tests__/SetupTests.ts` mocks canvas and stubs Face/Plate components.
- Lint/Typecheck: `npm run lint`, `npm run typecheck`. Build: `npm run build` → `docs/` (base `"/photo-privacy/"`).

Conventions

- Use alias `@` → `./src` for imports. Keep `main.tsx` import order intact (ORT first, bootstrap before app CSS).
- New detectors should implement `BlurHandler` and update perf via `{ preprocess, run, post, total }` and `count` like existing ones.
- Model/asset URLs must be `BASE_URL`-aware for Pages; add assets under `public/…`.

Models and ORT sidecars

- ORT files are copied to `public/ort-runtime/` with dashed↔dotted aliases by `scripts/prepare-ort-sidecars.mjs` (runs predev/prebuild/postinstall).
- Face API files are fetched into `public/models/face-api/` by `scripts/fetch-face-models.mjs`.
- For debugging, `ortForceBasicWasm()` disables SIMD/threads.

CI/CD

- CI: `.github/workflows/ci.yml` runs lint, typecheck, tests, build.
- Deploy: `.github/workflows/deploy-pages.yml` publishes `docs/` to GitHub Pages.

Pointers

- Start with: `components/PrivacyScrubber.tsx`, `components/LicensePlateBlur.tsx`, `components/FaceBlur.tsx`, `components/constants.ts`, `src/ort-setup.ts`, `scripts/*`.
