import * as ort from "onnxruntime-web";
import { createOrtSession } from "@/ort-setup";

type MaybeViteImportMeta = ImportMeta & { env?: { DEV?: boolean } };
const __DEV__ =
  typeof import.meta !== "undefined" &&
  (import.meta as MaybeViteImportMeta).env?.DEV === true;

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

let MODEL_INPUT_SIZE = 640; // default; may be overridden by model metadata

let session: ort.InferenceSession | null = null;

/** Load (memoized) ONNX session */
export async function loadFaceModel(
  modelUrl: string
): Promise<ort.InferenceSession> {
  if (!session) {
    // Fetch bytes explicitly to fail fast on 404/HTML and avoid protobuf errors
    const res = await fetch(modelUrl, { cache: "no-store" });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      console.error(
        `[face-detect] Failed to fetch model: ${res.status} ${res.statusText} @ ${modelUrl}`,
        text?.slice(0, 200)
      );
      throw new Error(`Model HTTP ${res.status} @ ${modelUrl}`);
    }
    const ctype = res.headers.get("content-type") || "";
    if (/text\/(html|plain)/i.test(ctype)) {
      const text = await res.text().catch(() => "");
      console.error(
        `[face-detect] Model URL returned text content-type (${ctype}). Is the path correct?`,
        text.slice(0, 200)
      );
      throw new Error(`Bad content-type for model: ${ctype}`);
    }
    const bytes = new Uint8Array(await res.arrayBuffer());
    if (bytes.byteLength < 8 * 1024) {
      console.error(
        `[face-detect] Model seems too small (${bytes.byteLength} bytes). Check that "${modelUrl}" points to a real .onnx file under public/.`
      );
      throw new Error(`Model file too small: ${bytes.byteLength} bytes`);
    }
    session = await createOrtSession(bytes, {
      executionProviders: ["wasm"],
      graphOptimizationLevel: "all",
    });
    try {
      // Infer S from first input dims if available
      const inName = session.inputNames?.[0];
      if (inName) {
        const im = session.inputMetadata as unknown as
          | Record<
              string,
              { dimensions?: readonly number[] | readonly (number | null)[] }
            >
          | undefined;
        const meta = im?.[inName];
        const dims = meta?.dimensions as readonly (number | null)[] | undefined;
        // Expect [N, C, S, S] or dynamic N; pick the last two when equal
        if (Array.isArray(dims) && dims.length >= 4) {
          const h = dims[dims.length - 2];
          const w = dims[dims.length - 1];
          const S = typeof h === "number" && h === w ? h : undefined;
          if (typeof S === "number" && Number.isFinite(S) && S > 0) {
            MODEL_INPUT_SIZE = S;
            if (__DEV__) {
              console.log(
                `[face-detect] Using model input size S=${MODEL_INPUT_SIZE} from ONNX metadata (input: ${inName}).`
              );
            }
          }
        }
      }
    } catch {
      // non-fatal; keep default
    }
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
  // Dev-only debug: log output dims to help verify head expectations
  if (__DEV__) {
    console.log(
      `[face-detect] run: output dims for "${outputName}":`,
      JSON.stringify(out.dims)
    );
  }

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

  // Convert to NCHW float32 [0,1] — CHW layout expected for [1,3,S,S]
  const f = new Float32Array(target * target * 3);
  const area = target * target;
  for (let y = 0; y < target; y++) {
    for (let x = 0; x < target; x++) {
      const idx = y * target + x; // pixel index in the padded SxS image
      const base = idx * 4; // RGBA
      const r = (d[base + 0] ?? 0) / 255;
      const g = (d[base + 1] ?? 0) / 255;
      const b = (d[base + 2] ?? 0) / 255;
      // CHW planes
      f[0 * area + idx] = r;
      f[1 * area + idx] = g;
      f[2 * area + idx] = b;
    }
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
    return idx >= 0 && idx < maxLen ? data[idx]! : 0;
  };

  const boxes: FaceBox[] = [];
  const { scale, padX, padY, target } = info;

  // If N matches common YOLO stride grids, treat outputs as raw predictions and decode
  const strides = [8, 16, 32];
  const shapes = strides.map((s) => Math.round(target / s));
  const expectedN = shapes.reduce((acc, g) => acc + g * g, 0);
  if (N === expectedN) {
    // Try DFL (YOLOv8/YOLOv11) first: E ≈ 4*reg_max + 1 + C (objectness + classes)
    const detectRegMax = (E: number): number | null => {
      const candidates = [16, 32, 8, 4];
      for (const r of candidates) {
        const rem = E - 4 * r;
        if (rem >= 1 && rem <= 5 /* obj + small class count */) return r;
        if (rem === 1 /* class-only */) return r; // some exports omit objectness
      }
      return null;
    };

    const regMax = detectRegMax(E);
    const hasDFL = !!regMax;
    if (__DEV__) {
      console.log(
        `[face-detect] decode path: ${
          hasDFL ? "DFL" : "center-size"
        } (order=${order}, N=${N}, E=${E}, regMax=${
          regMax ?? "-"
        }, strides=${strides.join(",")})`
      );
    }

    let i = 0;
    for (let s = 0; s < shapes.length; s++) {
      const g = shapes[s]!;
      const stride = strides[s]!;
      for (let y = 0; y < g; y++) {
        for (let x = 0; x < g; x++, i++) {
          if (hasDFL) {
            const r = regMax!;
            const rem = E - 4 * r;
            let conf = 1;
            if (rem >= 2) {
              const obj = sigmoid(read(i, 4 * r));
              let best = 0;
              for (let c = 4 * r + 1; c < E; c++) {
                const cls = sigmoid(read(i, c));
                if (cls > best) best = cls;
              }
              conf = obj * best;
            } else if (rem === 1) {
              // single-class, no explicit objectness
              conf = sigmoid(read(i, 4 * r));
            }
            if (conf < threshold) continue;

            // DFL expectation per side
            const exp = (start: number, count: number) => {
              // numerically stable softmax expectation
              let m = -Infinity;
              for (let k = 0; k < count; k++)
                m = Math.max(m, read(i, start + k));
              let den = 0;
              const probs = new Array<number>(count);
              for (let k = 0; k < count; k++) {
                const v = Math.exp(read(i, start + k) - m);
                probs[k] = v;
                den += v;
              }
              let ex = 0;
              if (den > 0) {
                for (let k = 0; k < count; k++) ex += (k * probs[k]!) / den;
              }
              return ex;
            };

            const px = x + 0.5;
            const py = y + 0.5;
            const dl = exp(0 * r, r);
            const dt = exp(1 * r, r);
            const dr = exp(2 * r, r);
            const db = exp(3 * r, r);

            const x0m = (px - dl) * stride;
            const y0m = (py - dt) * stride;
            const x1m = (px + dr) * stride;
            const y1m = (py + db) * stride;

            const x0 = (x0m - padX) / scale;
            const y0 = (y0m - padY) / scale;
            const x1 = (x1m - padX) / scale;
            const y1 = (y1m - padY) / scale;

            const bx0 = clamp(x0, 0, origW);
            const by0 = clamp(y0, 0, origH);
            const bx1 = clamp(x1, 0, origW);
            const by1 = clamp(y1, 0, origH);
            const bw = Math.max(0, bx1 - bx0);
            const bh = Math.max(0, by1 - by0);
            if (bw > 1 && bh > 1)
              boxes.push({ x: bx0, y: by0, w: bw, h: bh, score: conf });
          } else {
            // YOLOv5/7-style center/size decode
            const tx = read(i, 0);
            const ty = read(i, 1);
            const tw = read(i, 2);
            const th = read(i, 3);
            let conf = sigmoid(read(i, 4));
            if (E > 5) {
              let best = 0;
              for (let c = 5; c < E; c++) {
                const cls = sigmoid(read(i, c));
                if (cls > best) best = cls;
              }
              conf *= best;
            }
            if (conf < threshold) continue;

            const cx = (sigmoid(tx) * 2 - 0.5 + x) * stride;
            const cy = (sigmoid(ty) * 2 - 0.5 + y) * stride;
            const w = (sigmoid(tw) * 2) ** 2 * stride;
            const h = (sigmoid(th) * 2) ** 2 * stride;

            const x0 = (cx - w / 2 - padX) / scale;
            const y0 = (cy - h / 2 - padY) / scale;
            const x1 = (cx + w / 2 - padX) / scale;
            const y1 = (cy + h / 2 - padY) / scale;

            const bx0 = clamp(x0, 0, origW);
            const by0 = clamp(y0, 0, origH);
            const bx1 = clamp(x1, 0, origW);
            const by1 = clamp(y1, 0, origH);
            const bw = Math.max(0, bx1 - bx0);
            const bh = Math.max(0, by1 - by0);
            if (bw > 1 && bh > 1)
              boxes.push({ x: bx0, y: by0, w: bw, h: bh, score: conf });
          }
        }
      }
    }
    return boxes;
  } else {
    if (__DEV__) {
      console.log(
        `[face-detect] decode path: attr/NE fallback (order=${order}, N=${N}, E=${E})`
      );
    }
  }

  for (let i = 0; i < N; i++) {
    let score = sigmoid(read(i, 4));

    // If extra attributes look like class probs (not 10-landmark layout), multiply best class
    const attrCount = E - 5;
    if (attrCount > 0 && attrCount !== 10) {
      let best = 0;
      for (let c = 5; c < E; c++) {
        const v = sigmoid(read(i, c));
        if (v > best) best = v;
      }
      score *= best;
    }
    if (score < threshold) continue;

    // Infer whether outputs are xyxy or cx,cy,w,h by simple heuristics
    const v0 = read(i, 0);
    const v1 = read(i, 1);
    const v2 = read(i, 2);
    const v3 = read(i, 3);

    let x0 = 0;
    let y0 = 0;
    let x1 = 0;
    let y1 = 0;
    if (v2 >= v0 && v3 >= v1) {
      // Looks like xyxy
      let x0p = v0;
      let y0p = v1;
      let x1p = v2;
      let y1p = v3;
      if (Math.max(x0p, y0p, x1p, y1p) <= 1) {
        x0p *= target;
        y0p *= target;
        x1p *= target;
        y1p *= target;
      }
      x0 = (x0p - padX) / scale;
      y0 = (y0p - padY) / scale;
      x1 = (x1p - padX) / scale;
      y1 = (y1p - padY) / scale;
    } else {
      // Assume cx,cy,w,h
      let cx = v0;
      let cy = v1;
      let w = v2;
      let h = v3;
      if (Math.max(cx, cy, w, h) <= 1) {
        cx *= target;
        cy *= target;
        w *= target;
        h *= target;
      }
      const mx = cx - w / 2;
      const my = cy - h / 2;
      x0 = (mx - padX) / scale;
      y0 = (my - padY) / scale;
      x1 = (mx + w - padX) / scale;
      y1 = (my + h - padY) / scale;
    }
    // Clamp to original image size
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

function sigmoid(x: number): number {
  return 1 / (1 + Math.exp(-x));
}
