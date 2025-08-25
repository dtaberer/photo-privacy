import {
  FilesetResolver,
  FaceDetector,
  type FaceDetectorResult,
} from "@mediapipe/tasks-vision";
import type { BBox, DetectTimings, MPFaceOpts } from "@/types/detectors";

const detectorCache: Map<string, Promise<FaceDetector>> = new Map();

// Pin this to the version - needs to match with version in package.json
const WASM_BASE =
  "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.11/wasm";

export const MODEL_FACE_TASK =
  "https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/latest/blaze_face_short_range.tflite";

async function devAssertBinary(url: string): Promise<void> {
  if (!import.meta.env.DEV) return;
  const r = await fetch(url, { method: "GET" });
  if (!r.ok) throw new Error(`Model fetch failed (${r.status}) at ${url}`);
  const ct = (r.headers.get("content-type") || "").toLowerCase();
  if (ct.includes("text/html"))
    throw new Error(`Model URL returned HTML (bad path?) → ${url}`);
  const lenHeader = r.headers.get("content-length");
  const len = lenHeader ? Number(lenHeader) : 0;
  if (Number.isFinite(len) && len > 0 && len < 100_000) {
    throw new Error(`Model looks too small (${len} bytes) → ${url}`);
  }
}

export async function detectFaces(
  img: HTMLImageElement,
  opts: MPFaceOpts = {
    modelAssetPath: MODEL_FACE_TASK,
  }
): Promise<{ boxes: BBox[]; timings: DetectTimings }> {
  const t0 = performance.now();
  const detector = await acquireFaceDetector(opts);
  const t1 = performance.now();

  const res: FaceDetectorResult = detector.detect(img);
  const t2 = performance.now();

  const boxes: BBox[] = [];
  for (const d of res.detections ?? []) {
    const bb = d.boundingBox;
    const x = bb?.originX ?? 0;
    const y = bb?.originY ?? 0;
    const w = bb?.width ?? 0;
    const h = bb?.height ?? 0;
    if (w > 0 && h > 0) boxes.push({ x, y, w, h });
  }

  const t3 = performance.now();
  return {
    boxes,
    timings: {
      preprocess: t1 - t0,
      run: t2 - t1,
      post: t3 - t2,
      total: t3 - t0,
    },
  };
}

export async function runFaceBlurOnCanvas(
  img: HTMLImageElement,
  canvas: HTMLCanvasElement,
  opts: MPFaceOpts & { blurRadius: number }
): Promise<{ count: number; timings?: DetectTimings; boxes?: BBox[] }> {
  const res = await detectFaces(img, opts);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D context unavailable");

  const blur = Math.max(0, opts.blurRadius | 0);
  if (blur > 0) {
    for (const r of res.boxes) {
      ctx.save();
      ctx.beginPath();
      ctx.rect(r.x, r.y, r.w, r.h);
      ctx.clip();
      ctx.filter = `blur(${blur}px)`;
      ctx.drawImage(img, 0, 0);
      ctx.restore();
    }
  }
  return { count: res.boxes.length, timings: res.timings, boxes: res.boxes };
}

export async function acquireFaceDetector(
  opts: MPFaceOpts = {
    modelAssetPath: MODEL_FACE_TASK,
  }
): Promise<FaceDetector> {
  const modelUrl = opts.modelAssetPath ?? MODEL_FACE_TASK;
  const wasmBase = opts.tasksBaseUrl ?? WASM_BASE;
  const minConf =
    typeof opts.minDetectionConfidence === "number"
      ? opts.minDetectionConfidence
      : 0.5;

  const key = `${wasmBase}|${modelUrl}|${minConf}`;
  const cached = detectorCache.get(key);
  if (cached) return cached;

  const created = (async () => {
    await devAssertBinary(modelUrl);
    const vision = await FilesetResolver.forVisionTasks(wasmBase);
    return FaceDetector.createFromOptions(vision, {
      baseOptions: { modelAssetPath: modelUrl },
      runningMode: "IMAGE",
      minDetectionConfidence: minConf,
    });
  })();

  detectorCache.set(key, created);
  return created;
}
