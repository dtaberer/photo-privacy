import { FaceApiNS } from "@/types/face-blur-types";
// import { DetectTimings } from "@/types/global";
import { drawBox, blurRegion } from "./license-plate-blur-utils";

export async function runFaceBlurOnCanvas(
  img: HTMLImageElement,
  canvas: HTMLCanvasElement,
  opts: {
    blurStrength?: number;
    confThresh?: number;
    modelsBase?: string;
    debug?: boolean;
  }
): Promise<void> {
  const t0 = performance.now();
  const blur = Math.max(1, Math.round(opts.blurStrength ?? 12));
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    perfReport = { count: 0, timings: { preprocess: 0, run: 0, post: 0, total: 0 } };

  // 1) Try hardware FaceDetector first
  const FD = window.FaceDetector;
  if (FD) {
    try {
      const det = new FD({ fastMode: true, maxDetectedFaces: 50 });
      const t1 = performance.now();
      const faces = await det.detect(img);
      const t2 = performance.now();
      for (const f of faces) {
        const bb = (f.boundingBox ?? f) as DOMRect;
        const rect = { x: bb.x, y: bb.y, w: bb.width, h: bb.height };
        if (opts.debug) drawBox(ctx, rect);
        // Blur from the current canvas so it composes with plate blur
        blurRegion(ctx, canvas, rect, blur);
      }
      const t3 = performance.now();
      return {
        count: faces.length ?? 0,
        timings: {
          preprocess: t1 - t0,
          run: t2 - t1,
          post: t3 - t2,
          total: t3 - t0,
        },
      };
    } catch {
      // fall through to JS model
    }
  }

  // 2) Fallback to face-api.js (requires models in /public)
  let faceapi: FaceApiNS | null = null;
  try {
    faceapi = (await import("face-api.js")) as unknown as FaceApiNS;
  } catch {
    throw new Error(
      "Face detection unavailable: FaceDetector API not present and 'face-api.js' not installed."
    );
  }

  // Try a few common model base paths
  const bases: Array<string> = [];
  if (opts.modelsBase) bases.push(opts.modelsBase);
  bases.push("/models/face", "/models");

  let loaded = false;
  for (const base of bases) {
    try {
      await faceapi.nets.tinyFaceDetector.loadFromUri(base);
      loaded = true;
      break;
    } catch {
      // try next base
    }
  }
  if (!loaded) {
    throw new Error(
      `TinyFaceDetector model not found under ${bases.join(", ")}`
    );
  }

  const t1 = performance.now();
  const detections = await faceapi.detectAllFaces(
    img,
    new faceapi.TinyFaceDetectorOptions({
      scoreThreshold: opts.confThresh ?? 0.6,
      inputSize: 416,
    })
  );
  const t2 = performance.now();

  for (const d of detections) {
    const rect = { x: d.box.x, y: d.box.y, w: d.box.width, h: d.box.height };
    if (opts.debug) drawBox(ctx, rect);
    // Blur from the current canvas so it composes with plate blur
    blurRegion(ctx, canvas, rect, blur);
  }
  const t3 = performance.now();
  return {
    count: detections.length ?? 0,
    timings: {
      preprocess: t1 - t0,
      run: t2 - t1,
      post: t3 - t2,
      total: t3 - t0,
    },
  };
}
