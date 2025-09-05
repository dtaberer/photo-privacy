# Photo Privacy Scrubber

Fast, privacy‑first redaction for faces and license plates — runs entirely in your browser. No uploads, no servers, no tracking. Paste, drag‑drop, or pick a photo; tune blur and feather; download the redacted result.

## Live Demo

- Deploy this repo to GitHub Pages (workflow included) or Vercel/Netlify.
- Once deployed, add your live URL here for quick sharing.

## Features

- On‑device detection: no data leaves your machine
- License plates and faces with adjustable blur, feather, and confidence
- Paste, drag‑drop, and file picker
- Performance badges and timings
- Try‑Demo flow with a local sample image
- Accessible controls, keyboard‑friendly sliders, screen‑reader labels
- Thorough tests (Vitest + Testing Library)

## Tech Stack

- React 19 + Vite + TypeScript
- onnxruntime‑web for plates; FaceDetector API or face‑api.js fallback
- React‑Bootstrap for layout and controls
- Vitest + @testing‑library for tests

## Local Development

```bash
npm ci
npm run dev
```

Useful scripts:

- `npm run test` — run the test suite once
- `npm run test:watch` — watch mode
- `npm run lint` — ESLint
- `npm run typecheck` — `tsc --noEmit`
- `npm run dev` — Vite dev server
- `npm run build` — production build to `dist/`

## Deploy Options

### GitHub Pages (no credentials needed)

This repo includes two workflows:

- `.github/workflows/ci.yml` — lint, typecheck, test, build
- `.github/workflows/deploy-pages.yml` — builds and deploys `dist/` to Pages

Steps:

1. Push this repo to GitHub.
2. In GitHub: Settings → Pages → Build and deployment → Source: GitHub Actions.
3. Push to `main` or `master` — the deploy workflow publishes automatically.

Vite is configured with `base: "./"` so it works under a subpath.

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

New tests added for interaction and layout behavior:

- `src/__tests__/FileLoader.interaction.spec.tsx` — paste, drag‑drop, input change
- `src/__tests__/Preview.initial.spec.tsx` — initial height/classes before image load
- Existing: action buttons, controls, refresh/detect flows, slider behaviors

Run them locally with `npm test`.

## Privacy

All detection runs on your device. Images never leave your machine. Models load from the same origin as the app and are cached locally by the browser.

## License

Proprietary or personal — choose what fits your goals. If you want, I can add an OSS license (MIT/Apache‑2.0).

