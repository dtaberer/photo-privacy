// src/components/utils/detectors.ts
// Robust detectors with YOLO output parsing and resilient Face fallback.
// Exports:
//   - runLicensePlateBlurOnCanvas(img, canvas, opts) -> { count, timings }
//   - runFaceBlurOnCanvas(img, canvas, opts)        -> { count, timings }
//   - DetectTimings type

import type { Tensor } from "onnxruntime-web";
import { ort, createOrtSession, ortForceBasicWasm } from "../../ort-setup";

export type DetectTimings = {
  preprocess: number;
  run: number;
  post: number;
  total: number;
};

/* ========================= tiny helpers ========================= */
function firstValue<V>(o: Record<string, V>): V {
  const vals = Object.values(o);
  if (vals.length === 0) throw new Error("Model returned no outputs");
  return vals[0];
}

/* ========================= common utils ========================= */
function get2D(out: Tensor): { data: Float32Array; dims: readonly number[] } {
  const dims = (out as unknown as { dims?: readonly number[] }).dims ?? [];
  const raw = (out as unknown as { data?: unknown }).data;
  if (!(raw instanceof Float32Array))
    throw new Error("Output tensor is not Float32Array");
  return { data: raw, dims };
}

function iou(
  a: { x: number; y: number; w: number; h: number },
  b: { x: number; y: number; w: number; h: number }
): number {
  const ax2 = a.x + a.w,
    ay2 = a.y + a.h;
  const bx2 = b.x + b.w,
    by2 = b.y + b.h;
  const x1 = Math.max(a.x, b.x);
  const y1 = Math.max(a.y, b.y);
  const x2 = Math.min(ax2, bx2);
  const y2 = Math.min(ay2, by2);
  const w = Math.max(0, x2 - x1);
  const h = Math.max(0, y2 - y1);
  const inter = w * h;
  const ua = a.w * a.h + b.w * b.h - inter;
  return ua > 0 ? inter / ua : 0;
}

function nms(
  boxes: Array<{ x: number; y: number; w: number; h: number; conf: number }>,
  thr: number
) {
  boxes.sort((a, b) => b.conf - a.conf);
  const keep: typeof boxes = [];
  for (const b of boxes) if (keep.every((k) => iou(k, b) <= thr)) keep.push(b);
  return keep;
}

function letterbox(src: HTMLImageElement, dstSize: number) {
  const S = Math.round(dstSize);
  const iw = src.naturalWidth,
    ih = src.naturalHeight;
  const r = Math.min(S / iw, S / ih);
  const nw = Math.round(iw * r),
    nh = Math.round(ih * r);
  const dx = Math.floor((S - nw) / 2),
    dy = Math.floor((S - nh) / 2);
  const off = document.createElement("canvas");
  off.width = S;
  off.height = S;
  const octx = off.getContext("2d");
  if (!octx) throw new Error("2D context unavailable");
  octx.fillStyle = "black";
  octx.fillRect(0, 0, S, S);
  octx.drawImage(src, 0, 0, iw, ih, dx, dy, nw, nh);
  const { data } = octx.getImageData(0, 0, S, S);
  const plane = S * S;
  const input = new Float32Array(3 * plane);
  for (let px = 0, i = 0; px < plane; px++, i += 4) {
    input[px] = (data[i] ?? 0) / 255;
    input[plane + px] = (data[i + 1] ?? 0) / 255;
    input[2 * plane + px] = (data[i + 2] ?? 0) / 255;
  }
  return { input, scale: r, pad: { x: dx, y: dy }, S } as const;
}

function blurRegion(
  ctx: CanvasRenderingContext2D,
  src: CanvasImageSource,
  r: { x: number; y: number; w: number; h: number },
  radius: number
) {
  const x = Math.round(r.x),
    y = Math.round(r.y);
  const w = Math.max(1, Math.round(r.w)),
    h = Math.max(1, Math.round(r.h));
  if (w <= 0 || h <= 0) return;
  const off = document.createElement("canvas");
  off.width = w;
  off.height = h;
  const octx = off.getContext("2d");
  if (!octx) return;
  octx.filter = `blur(${Math.max(1, radius)}px)`;
  octx.drawImage(src, x, y, w, h, 0, 0, w, h);
  ctx.drawImage(off, x, y);
}

function drawBox(
  ctx: CanvasRenderingContext2D,
  r: { x: number; y: number; w: number; h: number }
) {
  ctx.save();
  ctx.strokeStyle = "rgba(0,200,255,0.9)";
  ctx.lineWidth = 2;
  ctx.strokeRect(
    Math.round(r.x) + 0.5,
    Math.round(r.y) + 0.5,
    Math.round(r.w),
    Math.round(r.h)
  );
  ctx.restore();
}

/* ========================= YOLO output parsing ========================= */
function parseYolo(
  data: Float32Array,
  dims: readonly number[],
  opts: {
    conf: number;
    pad: { x: number; y: number };
    scale: number;
    padRatio: number;
    max?: number;
  }
) {
  const boxes: Array<{
    x: number;
    y: number;
    w: number;
    h: number;
    conf: number;
  }> = [];
  const padX = opts.pad.x,
    padY = opts.pad.y,
    scale = opts.scale,
    padRatio = opts.padRatio;

  let valuesPer = 0;
  let numCandidates = 0;
  let get: (i: number, c: number) => number;
  if (dims.length === 3) {
    const C = dims[1];
    const N = dims[2];
    if (C >= 5 && C <= 256) {
      // [1, C, N]
      valuesPer = C;
      numCandidates = N;
      get = (i, c) => data[c * numCandidates + i];
    } else {
      // [1, N, C]
      valuesPer = N;
      numCandidates = C;
      get = (i, c) => data[i * valuesPer + c];
    }
  } else if (dims.length === 2) {
    const R = dims[0];
    const K = dims[1];
    if (K >= 5) {
      // [N, K]
      valuesPer = K;
      numCandidates = R;
      get = (i, c) => data[i * valuesPer + c];
    } else {
      // [K, N]
      valuesPer = R;
      numCandidates = K;
      get = (i, c) => data[c * numCandidates + i];
    }
  } else {
    valuesPer = 6;
    numCandidates = Math.floor(data.length / valuesPer);
    get = (i, c) => data[i * valuesPer + c];
  }

  const maxN = Math.min(numCandidates, opts.max ?? numCandidates);
  for (let i = 0; i < maxN; i++) {
    const cx = get(i, 0),
      cy = get(i, 1),
      w = get(i, 2),
      h = get(i, 3);
    let conf = get(i, 4);
    if (valuesPer > 5) {
      let best = 0;
      for (let c = 5; c < valuesPer; c++) best = Math.max(best, get(i, c));
      conf = conf * best;
    }
    if (!isFinite(conf) || conf < opts.conf) continue;
    if (!isFinite(cx) || !isFinite(cy) || !isFinite(w) || !isFinite(h))
      continue;

    let x = cx - w / 2;
    let y = cy - h / 2;
    x = (x - padX) / scale;
    y = (y - padY) / scale;
    const ww = w / scale,
      hh = h / scale;
    const ex = ww * padRatio,
      ey = hh * padRatio;
    boxes.push({ x: x - ex, y: y - ey, w: ww + 2 * ex, h: hh + 2 * ey, conf });
  }
  return boxes;
}

/* ========================= plates (onnxruntime-web) ========================= */
let plateSession: ort.InferenceSession | null = null;
let plateInputName = "";

async function ensurePlateSession(
  modelUrl: string
): Promise<ort.InferenceSession> {
  if (plateSession) return plateSession;
  ortForceBasicWasm();
  const resp = await fetch(modelUrl, { cache: "no-store" });
  if (!resp.ok) throw new Error(`Model HTTP ${resp.status}`);
  const buf = await resp.arrayBuffer();
  const sess = await createOrtSession(buf);
  plateSession = sess;
  plateInputName = sess.inputNames?.[0] ?? "images";
  return sess;
}

export async function runLicensePlateBlurOnCanvas(
  img: HTMLImageElement,
  canvas: HTMLCanvasElement,
  opts: {
    modelUrl?: string;
    blurRadius?: number;
    confThresh?: number;
    iou?: number;
    modelSize?: number;
    padRatio?: number;
    debug?: boolean;
  } = {}
): Promise<{ count: number; timings: DetectTimings }> {
  const t0 = performance.now();
  const ctx = canvas.getContext("2d");
  if (!ctx)
    return { count: 0, timings: { preprocess: 0, run: 0, post: 0, total: 0 } };

  const modelUrl = opts.modelUrl ?? "/models/license-plate-finetune-v1n.onnx";
  const modelSize = Math.round(opts.modelSize ?? 640);
  const conf = opts.confThresh ?? 0.35;
  const iouThr = opts.iou ?? 0.45;
  const padRatio = Math.max(0, Math.min(0.5, opts.padRatio ?? 0.2));
  const blur = Math.max(1, Math.round(opts.blurRadius ?? 14));

  const sess = await ensurePlateSession(modelUrl);
  const { input, scale, pad } = letterbox(img, modelSize);
  const tensor = new ort.Tensor("float32", input, [1, 3, modelSize, modelSize]);
  const feeds: Record<string, Tensor> = {
    [plateInputName]: tensor as unknown as Tensor,
  };
  const t1 = performance.now();
  const out = await sess.run(feeds);
  const t2 = performance.now();
  const first = firstValue(out) as Tensor;
  const { data, dims } = get2D(first);

  const raw = parseYolo(data, dims, { conf, pad, scale, padRatio, max: 30000 });
  const boxes = nms(raw, iouThr);

  for (const b of boxes) {
    const sx = Math.max(0, Math.floor(b.x));
    const sy = Math.max(0, Math.floor(b.y));
    const sw = Math.min(canvas.width - sx, Math.ceil(b.w));
    const sh = Math.min(canvas.height - sy, Math.ceil(b.h));
    if (sw > 0 && sh > 0) {
      if (opts.debug) drawBox(ctx, { x: sx, y: sy, w: sw, h: sh });
      // Use source image to avoid cumulative blurs for plates
      blurRegion(ctx, img, { x: sx, y: sy, w: sw, h: sh }, blur);
    }
  }
  const t3 = performance.now();
  return {
    count: boxes.length,
    timings: {
      preprocess: t1 - t0,
      run: t2 - t1,
      post: t3 - t2,
      total: t3 - t0,
    },
  };
}

/* ========================= faces (FaceDetector | face-api.js) ========================= */
// Minimal surface we use from face-api.js
interface FaceApiNS {
  nets: { tinyFaceDetector: { loadFromUri(base: string): Promise<void> } };
  TinyFaceDetectorOptions: new (opts?: {
    scoreThreshold?: number;
    inputSize?: number;
  }) => unknown;
  detectAllFaces: (
    img: CanvasImageSource,
    options: unknown
  ) => Promise<
    Array<{ box: { x: number; y: number; width: number; height: number } }>
  >;
}

export async function runFaceBlurOnCanvas(
  img: HTMLImageElement,
  canvas: HTMLCanvasElement,
  opts: {
    blurRadius?: number;
    confThresh?: number;
    modelsBase?: string;
    debug?: boolean;
  } = {}
): Promise<{ count: number; timings: DetectTimings }> {
  const t0 = performance.now();
  const blur = Math.max(1, Math.round(opts.blurRadius ?? 12));
  const ctx = canvas.getContext("2d");
  if (!ctx)
    return { count: 0, timings: { preprocess: 0, run: 0, post: 0, total: 0 } };

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
