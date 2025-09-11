// src/components/utils/face-detector-onnx.ts
import * as ort from "onnxruntime-web";

export type FaceBox = {
  x: number;
  y: number;
  w: number;
  h: number;
  score: number;
};

type LetterboxInfo = {
  target: number; // e.g., 640
  scale: number; // min(target/w, target/h)
  padX: number; // left padding in model input pixels
  padY: number; // top padding in model input pixels
  resizedW: number; // floor(w * scale)
  resizedH: number; // floor(h * scale)
};

const MODEL_INPUT_SIZE = 640; // your ONNX expects 640x640 (per error)

let session: ort.InferenceSession | null = null;

/** Load (memoized) ONNX session */
export async function loadFaceModel(
  modelUrl: string
): Promise<ort.InferenceSession> {
  if (!session) {
    session = await ort.InferenceSession.create(modelUrl, {
      executionProviders: ["wasm"], // or "webgl"
      graphOptimizationLevel: "all",
    });
  }
  return session;
}

/** Detect faces from ImageData (handles letterbox to 640 and back) */
export async function detectFaces(
  imageData: ImageData,
  threshold = 0.4
): Promise<FaceBox[]> {
  if (!session) throw new Error("Model not loaded");
  const sess: ort.InferenceSession = session;

  const { width: origW, height: origH } = imageData;
  const { tensor, info } = preprocessLetterbox(imageData, MODEL_INPUT_SIZE);

  // Strictly resolve real input/output names
  const inputName = firstRequiredName(sess.inputNames, "inputNames");
  const outputName = firstRequiredName(sess.outputNames, "outputNames");

  const results = await sess.run({ [inputName]: tensor });
  const out = getTensor(results, outputName);

  const raw = decodeYoloOutput(out, info, origW, origH, threshold);
  return nms(raw, 0.45);
}

/** Letterbox RGBA ImageData -> [1,3,S,S] float32 [0,1] + mapping info */
function preprocessLetterbox(
  image: ImageData,
  target: number
): { tensor: ort.Tensor; info: LetterboxInfo } {
  const { width: w, height: h, data: rgba } = image;
  if (rgba.length !== w * h * 4) {
    throw new Error(
      `ImageData length mismatch: got ${rgba.length}, expected ${w * h * 4}`
    );
  }

  // Compute letterbox params
  const scale = Math.min(target / w, target / h);
  const resizedW = Math.floor(w * scale);
  const resizedH = Math.floor(h * scale);
  const padX = Math.floor((target - resizedW) / 2);
  const padY = Math.floor((target - resizedH) / 2);

  // Draw into a 640x640 canvas with padding
  const src = document.createElement("canvas");
  src.width = w;
  src.height = h;
  const sctx = src.getContext("2d");
  if (!sctx) throw new Error("2D context unavailable");
  sctx.putImageData(image, 0, 0);

  const dst = document.createElement("canvas");
  dst.width = target;
  dst.height = target;
  const dctx = dst.getContext("2d");
  if (!dctx) throw new Error("2D context unavailable (dst)");

  // fill padding (114,114,114) like Ultralytics
  dctx.fillStyle = "rgb(114,114,114)";
  dctx.fillRect(0, 0, target, target);

  // draw scaled image centered
  dctx.imageSmoothingQuality = "high";
  dctx.drawImage(src, 0, 0, w, h, padX, padY, resizedW, resizedH);

  // Read back as ImageData
  const letter = dctx.getImageData(0, 0, target, target);
  const d: Uint8ClampedArray = letter.data;

  // Convert to NCHW float32 [0,1]
  const f = new Float32Array(target * target * 3);
  for (let i = 0; i < target * target; i++) {
    const base = i * 4;
    const dstIdx = i * 3;
    f[dstIdx + 0] = d[base + 0] / 255;
    f[dstIdx + 1] = d[base + 1] / 255;
    f[dstIdx + 2] = d[base + 2] / 255;
  }

  const tensor = new ort.Tensor("float32", f, [1, 3, target, target]);
  const info: LetterboxInfo = { target, scale, padX, padY, resizedW, resizedH };
  return { tensor, info };
}

/** Get the first name from a readonly array, with strict checks */
function firstRequiredName(
  names: readonly string[] | undefined,
  label: string
): string {
  if (!names || names.length === 0) throw new Error(`No ${label} in model`);
  const n = names[0];
  if (typeof n !== "string" || n.length === 0)
    throw new Error(`Invalid ${label}[0] value`);
  return n;
}

/** Type guard for ONNX Tensor. */
function isTensor(x: unknown): x is ort.Tensor {
  return (
    typeof x === "object" &&
    x !== null &&
    "dims" in x &&
    "data" in x &&
    "type" in x
  );
}

/** Fetch a named tensor result (throws if missing) */
function getTensor(
  map: ort.InferenceSession.OnnxValueMapType,
  name: string
): ort.Tensor {
  const v = map[name];
  if (!isTensor(v)) throw new Error(`Output "${name}" missing or not a Tensor`);
  return v;
}

/** Ensure number (narrow away undefined) with friendly error */
function asNum(n: number | undefined, label: string): number {
  if (typeof n !== "number")
    throw new Error(`Bad output dims: ${label} is ${String(n)}`);
  return n;
}

/** Normalize to Float32Array */
function asFloat32(t: ort.Tensor): Float32Array {
  if (t.type !== "float32")
    throw new Error(`Expected float32 tensor, got ${String(t.type)}`);
  return t.data instanceof Float32Array
    ? t.data
    : Float32Array.from(t.data as ArrayLike<number>);
}

/**
 * Decode Ultralytics-style YOLO head and un-letterbox back to original pixels.
 * Supports shapes: [1,N,E], [1,E,N], or [N,E]. E>=5 (cx,cy,w,h,conf,...)
 */
function decodeYoloOutput(
  out: ort.Tensor,
  info: LetterboxInfo,
  origW: number,
  origH: number,
  threshold: number
): FaceBox[] {
  const dims = out.dims;
  const data = asFloat32(out);

  let N = 0;
  let E = 0;
  type Order = "N_ATTR" | "ATTR_N" | "NE";
  let order: Order;

  if (dims.length === 3) {
    const d1 = asNum(dims[1], "dims[1]");
    const d2 = asNum(dims[2], "dims[2]");
    if (d2 >= 6 && d2 <= 64) {
      N = d1;
      E = d2;
      order = "N_ATTR";
    } else {
      N = d2;
      E = d1;
      order = "ATTR_N";
    }
  } else if (dims.length === 2) {
    const d0 = asNum(dims[0], "dims[0]");
    const d1 = asNum(dims[1], "dims[1]");
    N = d0;
    E = d1;
    order = "NE";
  } else {
    throw new Error(`Unsupported output dims: ${JSON.stringify(dims)}`);
  }

  if (N <= 0 || E < 5) return [];

  const maxLen = data.length;
  const read = (i: number, k: number): number => {
    const idx = order === "N_ATTR" || order === "NE" ? i * E + k : k * N + i;
    return idx >= 0 && idx < maxLen ? data[idx] : 0;
  };

  const boxes: FaceBox[] = [];
  const { target, scale, padX, padY } = info;

  for (let i = 0; i < N; i++) {
    const cx = read(i, 0);
    const cy = read(i, 1);
    const w = read(i, 2);
    const h = read(i, 3);
    let score = read(i, 4);

    // If extra attributes look like class probs (not 10-landmark layout), multiply best class
    const attrCount = E - 5;
    if (attrCount > 0 && attrCount !== 10) {
      let best = 0;
      for (let c = 5; c < E; c++) {
        const v = read(i, c);
        if (v > best) best = v;
      }
      score *= best;
    }
    if (score < threshold) continue;

    // Model-space box (on 640x640): convert cx,cy,w,h -> x,y,w,h
    const mx = cx - w / 2;
    const my = cy - h / 2;

    // Un-letterbox back to original pixels
    const x0 = (mx - padX) / scale;
    const y0 = (my - padY) / scale;
    const x1 = (mx + w - padX) / scale;
    const y1 = (my + h - padY) / scale;

    const bx0 = clamp(x0, 0, origW);
    const by0 = clamp(y0, 0, origH);
    const bx1 = clamp(x1, 0, origW);
    const by1 = clamp(y1, 0, origH);

    const bw = Math.max(0, bx1 - bx0);
    const bh = Math.max(0, by1 - by0);

    if (bw > 1 && bh > 1) boxes.push({ x: bx0, y: by0, w: bw, h: bh, score });
  }

  return boxes;
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

/** Greedy NMS */
function nms(boxes: FaceBox[], iouThresh: number): FaceBox[] {
  const sorted = [...boxes].sort((a, b) => b.score - a.score);
  const keep: FaceBox[] = [];
  while (sorted.length > 0) {
    const curr = sorted.shift()!; // length-guarded
    keep.push(curr);
    for (let j = sorted.length - 1; j >= 0; j--) {
      const cand = sorted[j];
      if (!cand) continue;
      if (iou(curr, cand) >= iouThresh) sorted.splice(j, 1);
    }
  }
  return keep;
}

function iou(a: FaceBox, b: FaceBox): number {
  const x0 = Math.max(a.x, b.x);
  const y0 = Math.max(a.y, b.y);
  const x1 = Math.min(a.x + a.w, b.x + b.w);
  const y1 = Math.min(a.y + a.h, b.y + b.h);
  const w = Math.max(0, x1 - x0);
  const h = Math.max(0, y1 - y0);
  const inter = w * h;
  const uni = a.w * a.h + b.w * b.h - inter;
  return uni > 0 ? inter / uni : 0;
}
