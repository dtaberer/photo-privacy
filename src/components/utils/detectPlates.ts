import * as ort from "onnxruntime-web";
import type {
  BBox,
  DetectTimings,
  PlateDetectOpts,
  Dims3,
  RawRow,
  Corner,
  PlateBlurOpts,
} from "@/types/detectors";

export const MODEL_PLATE_URL = "/models/license-plate-finetune-v1n.onnx";

/* ------------------------------------------------------------------------ */
/* Helpers                                                                  */
/* ------------------------------------------------------------------------ */

const get2D = (c: HTMLCanvasElement): CanvasRenderingContext2D => {
  const ctx = c.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D context unavailable");
  return ctx;
};

const imageSize = (img: HTMLImageElement) => ({
  w: img.naturalWidth || img.width || 0,
  h: img.naturalHeight || img.height || 0,
});

function letterboxImage(
  img: HTMLImageElement,
  dstW: number,
  dstH: number,
  padColor: readonly [number, number, number] = [114, 114, 114]
): { canvas: HTMLCanvasElement; scale: number; dx: number; dy: number } {
  const { w: srcW, h: srcH } = imageSize(img);
  const r = Math.min(dstW / srcW, dstH / srcH);
  const newW = Math.round(srcW * r);
  const newH = Math.round(srcH * r);
  const dx = Math.floor((dstW - newW) / 2);
  const dy = Math.floor((dstH - newH) / 2);

  const c = document.createElement("canvas");
  c.width = dstW;
  c.height = dstH;
  const ctx = get2D(c);
  ctx.fillStyle = `rgb(${padColor[0]},${padColor[1]},${padColor[2]})`;
  ctx.fillRect(0, 0, dstW, dstH);
  ctx.drawImage(img, 0, 0, srcW, srcH, dx, dy, newW, newH);
  return { canvas: c, scale: r, dx, dy };
}

function toCHWFloat32(canvas: HTMLCanvasElement): Float32Array {
  const width = canvas.width | 0;
  const height = canvas.height | 0;
  const rgba = get2D(canvas).getImageData(0, 0, width, height).data;
  const plane = width * height;
  const out = new Float32Array(3 * plane);

  const at = (i: number) => (i >= 0 && i < rgba.length ? rgba[i]! : 0);

  let p = 0;
  let i = 0;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const r = at(p);
      const g = at(p + 1);
      const b = at(p + 2);
      out[i] = r / 255;
      out[i + plane] = g / 255;
      out[i + 2 * plane] = b / 255;
      p += 4;
      i += 1;
    }
  }
  return out;
}

function ensureFloat32(data: unknown): Float32Array {
  if (data instanceof Float32Array) return data;

  if (
    data instanceof Uint8Array ||
    data instanceof Uint8ClampedArray ||
    data instanceof Int8Array ||
    data instanceof Uint16Array ||
    data instanceof Int16Array ||
    data instanceof Uint32Array ||
    data instanceof Int32Array ||
    data instanceof Float64Array
  ) {
    const out = new Float32Array(data.length);
    for (let i = 0; i < data.length; i++) out[i] = Number(data[i] ?? 0);
    return out;
  }
  if (data instanceof BigInt64Array || data instanceof BigUint64Array) {
    const out = new Float32Array(data.length);
    for (let i = 0; i < data.length; i++) out[i] = Number(data[i] ?? 0n);
    return out;
  }
  if (Array.isArray(data))
    return new Float32Array(data.map((v) => Number(v ?? 0)));
  if (data && typeof (data as { length: number }).length === "number") {
    const a = data as ArrayLike<unknown>;
    const out = new Float32Array(a.length);
    for (let i = 0; i < a.length; i++)
      out[i] = Number((a[i] as number | undefined) ?? 0);
    return out;
  }
  throw new Error("Unexpected tensor.data type");
}

function getDims3(dims: readonly number[] | undefined): Dims3 {
  if (!dims || dims.length !== 3 || dims[0] !== 1) {
    throw new Error(`Unexpected YOLO output shape: ${String(dims)}`);
  }
  const d1 = Number(dims[1]);
  const d2 = Number(dims[2]);
  if (!Number.isFinite(d1) || !Number.isFinite(d2)) {
    throw new Error(
      `YOLO dims must be finite at [1] and [2], got ${String(dims)}`
    );
  }
  return [1, d1, d2] as const;
}

/* ------------------------------------------------------------------------ */
/* Decoding + format/space autodetect                                       */
/* ------------------------------------------------------------------------ */

function decodeRaw(t: ort.Tensor, confThresh: number): RawRow[] {
  const [, d1, d2] = getDims3(t.dims);
  const N = d1 < d2 ? d1 : d2; // rows
  const C = d1 < d2 ? d2 : d1; // columns per row
  if (C < 5) throw new Error("YOLO output must have at least 5 values/row");

  const data = ensureFloat32((t as unknown as { data: unknown }).data);
  const len = data.length;
  const transposed = d1 > d2; // true => [1, C, N]

  const f32At = (idx: number) =>
    idx >= 0 && idx < len ? data[idx]! : Number.NaN;
  const read = (row: number, col: number) =>
    !transposed ? f32At(row * C + col) : f32At(col * N + row);

  const out: RawRow[] = [];
  const hasClasses = C > 5;

  for (let r = 0; r < N; r++) {
    const a = read(r, 0);
    const b = read(r, 1);
    const c = read(r, 2);
    const d = read(r, 3);
    const obj = read(r, 4);

    let conf = obj;
    if (hasClasses) {
      let best = 0;
      for (let k = 5; k < C; k++) {
        const v = read(r, k);
        if (Number.isFinite(v) && v > best) best = v;
      }
      conf = obj * best;
    }

    if (
      !Number.isFinite(a) ||
      !Number.isFinite(b) ||
      !Number.isFinite(c) ||
      !Number.isFinite(d) ||
      !Number.isFinite(conf) ||
      conf < confThresh
    )
      continue;

    out.push({ a, b, c, d, conf });
  }
  return out;
}

function looksNormalized(rows: RawRow[], assume?: boolean): boolean {
  if (typeof assume === "boolean") return assume;
  if (rows.length === 0) return false;
  let maxVal = 0;
  for (let i = 0; i < Math.min(rows.length, 200); i++) {
    const r = rows[i];
    const m = Math.max(r.a, r.b, r.c, r.d);
    if (m > maxVal) maxVal = m;
  }
  return maxVal <= 1.2;
}

function toCorners(rows: RawRow[], fmt: "cxcywh" | "xywh" | "xyxy"): Corner[] {
  const out: Corner[] = new Array(rows.length);
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    if (fmt === "cxcywh") {
      const x0 = r.a - r.c / 2;
      const y0 = r.b - r.d / 2;
      const x1 = r.a + r.c / 2;
      const y1 = r.b + r.d / 2;
      out[i] = { x0, y0, x1, y1, conf: r.conf };
    } else if (fmt === "xywh") {
      const x0 = r.a;
      const y0 = r.b;
      const x1 = r.a + r.c;
      const y1 = r.b + r.d;
      out[i] = { x0, y0, x1, y1, conf: r.conf };
    } else {
      // xyxy
      out[i] = { x0: r.a, y0: r.b, x1: r.c, y1: r.d, conf: r.conf };
    }
  }
  return out;
}

/** Count in-bounds boxes (model space). */
function scoreFormat(corners: Corner[], modelSize: number): number {
  let valid = 0;
  for (let i = 0; i < Math.min(corners.length, 500); i++) {
    const { x0, y0, x1, y1 } = corners[i]!;
    const w = x1 - x0,
      h = y1 - y0;
    if (
      w > 1 &&
      h > 1 &&
      x0 >= -2 &&
      y0 >= -2 &&
      x1 <= modelSize + 2 &&
      y1 <= modelSize + 2
    )
      valid++;
  }
  return valid;
}

function pickBestFormat(
  rows: RawRow[],
  modelSize: number
): "cxcywh" | "xywh" | "xyxy" {
  const c1 = toCorners(rows, "cxcywh");
  const c2 = toCorners(rows, "xywh");
  const c3 = toCorners(rows, "xyxy");
  const s1 = scoreFormat(c1, modelSize);
  const s2 = scoreFormat(c2, modelSize);
  const s3 = scoreFormat(c3, modelSize);
  const max = Math.max(s1, s2, s3);
  if (s2 === max) return "xywh";
  if (s1 === max) return "cxcywh";
  return "xyxy";
}

/* ------------------------------------------------------------------------ */
/* Mapping candidates & scoring (original image space)                      */
/* ------------------------------------------------------------------------ */

export type BoxScored = BBox & { conf: number };

function clampToImage(bb: BBox, W: number, H: number): BBox {
  const x = Math.max(0, Math.min(W, bb.x));
  const y = Math.max(0, Math.min(H, bb.y));
  const w = Math.max(0, Math.min(W - x, bb.w));
  const h = Math.max(0, Math.min(H - y, bb.h));
  return { x, y, w, h };
}

function nmsByConf(boxes: BoxScored[], iouThresh: number): BoxScored[] {
  const keep: BoxScored[] = [];
  const sorted = boxes.slice().sort((a, b) => b.conf - a.conf);
  for (const r of sorted) {
    let ok = true;
    for (const k of keep) {
      const x0 = Math.max(k.x, r.x);
      const y0 = Math.max(k.y, r.y);
      const x1 = Math.min(k.x + k.w, r.x + r.w);
      const y1 = Math.min(k.y + k.h, r.y + r.h);
      const iw = Math.max(0, x1 - x0);
      const ih = Math.max(0, y1 - y0);
      const inter = iw * ih;
      const union = k.w * k.h + r.w * r.h - inter;
      if (union > 0 && inter / union >= iouThresh) {
        ok = false;
        break;
      }
    }
    if (ok) keep.push(r);
  }
  return keep;
}

/** A plausibility score: prefer non-tiny, non-corner boxes */
function scoreBoxes(boxes: BBox[], W: number, H: number): number {
  if (boxes.length === 0) return 0;
  const areas = boxes.map((b) => (b.w * b.h) / (W * H)).sort((a, b) => a - b);
  const medArea = areas[Math.floor(areas.length / 2)]!;
  let cornerish = 0;
  for (const b of boxes) {
    const cx = (b.x + b.w / 2) / W;
    const cy = (b.y + b.h / 2) / H;
    if (cx < 0.2 && cy < 0.2) cornerish++;
  }
  const cornerPenalty = cornerish / boxes.length;
  const areaScore = Math.max(0, Math.min(1, (medArea - 0.0005) / 0.02));
  return areaScore * (1 - 0.7 * cornerPenalty);
}

function chooseBestMapping(
  cornersModel: Corner[],
  isNormalized: boolean,
  modelSize: number,
  { W, H }: { W: number; H: number },
  letterbox: { dx: number; dy: number; scale: number },
  force?: "letterbox" | "stretch" | "normalized"
): { boxes: BBox[]; mapping: "letterbox" | "stretch" | "normalized" } {
  const bxFromCorners = (c: Corner): BBox => ({
    x: c.x0,
    y: c.y0,
    w: c.x1 - c.x0,
    h: c.y1 - c.y0,
  });

  // A) undo letterbox
  const lb = cornersModel.map((c) =>
    bxFromCorners({
      ...c,
      x0: (c.x0 - letterbox.dx) / letterbox.scale,
      y0: (c.y0 - letterbox.dy) / letterbox.scale,
      x1: (c.x1 - letterbox.dx) / letterbox.scale,
      y1: (c.y1 - letterbox.dy) / letterbox.scale,
    })
  );
  // B) stretch
  const sx = W / modelSize,
    sy = H / modelSize;
  const st = cornersModel.map((c) =>
    bxFromCorners({
      ...c,
      x0: c.x0 * sx,
      y0: c.y0 * sy,
      x1: c.x1 * sx,
      y1: c.y1 * sy,
    })
  );
  // C) normalized original
  const no = cornersModel.map((c) =>
    bxFromCorners({
      ...c,
      x0: c.x0 * W,
      y0: c.y0 * H,
      x1: c.x1 * W,
      y1: c.y1 * H,
    })
  );

  if (force) {
    return force === "letterbox"
      ? { boxes: lb, mapping: "letterbox" }
      : force === "stretch"
      ? { boxes: st, mapping: "stretch" }
      : { boxes: no, mapping: "normalized" };
  }

  const cand: Array<{
    boxes: BBox[];
    mapping: "letterbox" | "stretch" | "normalized";
    score: number;
  }> = [
    { boxes: lb, mapping: "letterbox", score: scoreBoxes(lb, W, H) },
    { boxes: st, mapping: "stretch", score: scoreBoxes(st, W, H) },
    { boxes: no, mapping: isNormalized ? scoreBoxes(no, W, H) : 0 },
  ];
  cand.sort((a, b) => b.score - a.score);
  return { boxes: cand[0]!.boxes, mapping: cand[0]!.mapping };
}

/* ------------------------------------------------------------------------ */
/* Core API                                                                 */
/* ------------------------------------------------------------------------ */

let plateSession: ort.InferenceSession | null = null;

async function devAssertOnnx(url: string): Promise<void> {
  if (!import.meta.env.DEV) return;
  const r = await fetch(url, { method: "GET" });
  if (!r.ok) throw new Error(`ONNX fetch failed (${r.status}) at ${url}`);
  const ct = (r.headers.get("content-type") || "").toLowerCase();
  if (ct.includes("text/html"))
    throw new Error(`ONNX URL returned HTML: ${url}`);
}

export async function detectPlates(
  img: HTMLImageElement,
  {
    modelUrl,
    modelSize = 640,
    confThresh = 0.35,
    iouThresh = 0.6,
    padColor = [114, 114, 114],
    assumeNormalized,
    boxFormat = "auto",
    boxSpace = "auto",
  }: PlateDetectOpts
): Promise<{ boxes: BBox[]; timings: DetectTimings }> {
  const t0 = performance.now();

  if (!plateSession) {
    await devAssertOnnx(modelUrl);
    plateSession = await ort.InferenceSession.create(modelUrl, {
      executionProviders: ["wasm"],
      graphOptimizationLevel: "all",
    });
  }

  // Preprocess
  const tPre0 = performance.now();
  const {
    canvas: inCanvas,
    scale,
    dx,
    dy,
  } = letterboxImage(img, modelSize, modelSize, padColor);
  const chw = toCHWFloat32(inCanvas);
  const inputTensor = new ort.Tensor("float32", chw, [
    1,
    3,
    modelSize,
    modelSize,
  ]);
  const tPre1 = performance.now();

  // Run
  const inputName = plateSession.inputNames?.[0] as string | undefined;
  const outputName = plateSession.outputNames?.[0] as string | undefined;
  const feeds: Record<string, ort.Tensor> = inputName
    ? { [inputName]: inputTensor }
    : { input: inputTensor };

  const tRun0 = performance.now();
  const outMap = await plateSession.run(feeds);
  const firstTensor =
    outputName && outMap[outputName] instanceof ort.Tensor
      ? (outMap[outputName] as ort.Tensor)
      : (Object.values(outMap).find((v) => v instanceof ort.Tensor) as
          | ort.Tensor
          | undefined);
  if (!firstTensor) throw new Error("ONNX run produced no tensor output");
  const tRun1 = performance.now();

  // Post
  const tPost0 = performance.now();

  const raws = decodeRaw(firstTensor, confThresh);
  const normalized = looksNormalized(raws, assumeNormalized);
  const fmt =
    boxFormat === "auto" ? pickBestFormat(raws, modelSize) : boxFormat;
  const cornersModel = toCorners(raws, fmt);

  const { w: W, h: H } = imageSize(img);

  const forced =
    boxSpace === "letterbox"
      ? "letterbox"
      : boxSpace === "stretch"
      ? "stretch"
      : boxSpace === "normalized"
      ? "normalized"
      : undefined;

  const chosen = chooseBestMapping(
    cornersModel,
    normalized,
    modelSize,
    { W, H },
    { dx, dy, scale },
    forced
  );

  // Convert to scored boxes, clamp, drop tiny + non-plate-like AR, NMS by confidence
  const minAreaPct = 0.001; // drop < 0.10% of image area
  const minSizePx = 8; // drop tiny sides
  const minAR = 1.2,
    maxAR = 6.0; // license plates are usually wider than tall

  const scored: BoxScored[] = chosen.boxes
    .map((bb, i) => clampToImage(bb, W, H))
    .map((bb, i) => ({ ...bb, conf: cornersModel[i]!.conf }))
    .filter((b) => {
      const ar = b.w > 0 ? b.w / Math.max(1, b.h) : 0;
      const okArea = b.w * b.h >= minAreaPct * W * H;
      const okSize = b.w >= minSizePx && b.h >= minSizePx;
      const okAR = ar >= minAR && ar <= maxAR;
      return okArea && okSize && okAR;
    });

  const kept = nmsByConf(scored, iouThresh);
  const boxes = kept.map(({ conf: _c, ...b }) => b);

  const tPost1 = performance.now();

  if (import.meta.env.DEV) {
    // eslint-disable-next-line no-console
    console.debug(
      `[plates] dims=${JSON.stringify(firstTensor.dims)} rows=${raws.length} ` +
        `fmt=${fmt} norm=${normalized} space=${chosen.mapping} kept=${boxes.length}`
    );
  }

  const t1 = performance.now();
  return {
    boxes,
    timings: {
      preprocess: tPre1 - tPre0,
      run: tRun1 - tRun0,
      post: tPost1 - tPost0,
      total: t1 - t0,
    },
  };
}

/* ------------------------------------------------------------------------ */
/* Canvas wrapper                                                            */
/* ------------------------------------------------------------------------ */

export async function runLicensePlateBlurOnCanvas(
  img: HTMLImageElement,
  canvas: HTMLCanvasElement,
  opts: PlateBlurOpts
): Promise<{ count: number; timings?: DetectTimings; boxes?: BBox[] }> {
  const res = await detectPlates(img, opts);
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
