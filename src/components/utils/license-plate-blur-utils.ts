import type { Size, Box } from "@/types/detector-types";
import { Tensor } from "onnxruntime-web";

export function invariant(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

export function firstValue<V>(o: Record<string, V>): V {
  const vals = Object.values(o);
  if (vals.length === 0) throw new Error("Model returned no outputs");
  return vals[0] as V;
}

export function get2D(out: Tensor): {
  data: Float32Array;
  dims: readonly number[];
} {
  const dims = (out as unknown as { dims?: readonly number[] }).dims ?? [];
  const raw = (out as unknown as { data?: unknown }).data;
  if (!(raw instanceof Float32Array))
    throw new Error("Output tensor is not Float32Array");
  return { data: raw, dims };
}

export function nms(
  boxes: Array<{ x: number; y: number; w: number; h: number; conf: number }>,
  thr: number
) {
  boxes.sort((a, b) => b.conf - a.conf);
  const keep: typeof boxes = [];
  for (const b of boxes) if (keep.every((k) => iou(k, b) <= thr)) keep.push(b);
  return keep;
}

export function iou(
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

export function assertDims1xNxM(
  dims: unknown
): asserts dims is readonly [1, number, number] {
  invariant(Array.isArray(dims), "Tensor dims missing");
  invariant(dims.length === 3, `Unexpected dims length: ${dims.length}`);
  invariant(dims[0] === 1, `Batch dimension must be 1, got ${dims[0]}`);
}

export function getFloat32Data(t: Tensor): Float32Array {
  const data = (t as unknown as { data: unknown }).data;
  if (!(data instanceof Float32Array)) {
    const kind = Object.prototype.toString.call(data);
    throw new Error(`Tensor data is not Float32Array (got ${kind})`);
  }
  return data;
}

export function blurRegion(
  ctx: CanvasRenderingContext2D,
  src: CanvasImageSource,
  r: { x: number; y: number; w: number; h: number },
  strength: number
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
  octx.filter = `blur(${Math.max(1, strength)}px)`;
  octx.drawImage(src, x, y, w, h, 0, 0, w, h);
  ctx.drawImage(off, x, y);
}

export function strengthToBlur(strength: number): {
  radiusPx: number;
  passes: number;
} {
  const s = Math.max(0, Math.min(100, Math.round(strength)));
  const radiusPx = Math.round(1 + (19 * s) / 100); // ≈ 1..20 px
  const passes = s < 40 ? 1 : s < 75 ? 2 : 3; // 1..3 passes
  return { radiusPx, passes };
}

export function letterbox(src: HTMLImageElement, dstSize: number) {
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

export function toRows(out: Tensor): {
  rows: Float32Array;
  N: number;
  M: number;
} {
  const dimsAny = (out as unknown as { dims: unknown }).dims;
  if (!Array.isArray(dimsAny)) throw new Error("Tensor dims missing");
  const dims = dimsAny as number[];
  assertDims1xNxM(dims);
  const [, d1, d2] = dims;
  const data = getFloat32Data(out);

  const aN = d1,
    aM = d2;
  const bN = d2,
    bM = d1;

  if (bM >= 5 && (aM < 5 || bM <= aM)) {
    const N = bN,
      M = bM;
    const rows = new Float32Array(N * M);
    for (let m = 0; m < M; m++) {
      for (let n = 0; n < N; n++) rows[n * M + m] = data[m * N + n] ?? 0;
    }
    return { rows, N, M };
  }
  const N = aN,
    M = aM;
  return { rows: data, N, M };
}

export function parseYolo(
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
    const [, C, N] = dims as [number, number, number];
    if (C >= 5 && C <= 256) {
      // [1, C, N]
      valuesPer = C;
      numCandidates = N;
      get = (i, c) => data[c * numCandidates + i] ?? 0;
    } else {
      // [1, N, C]
      valuesPer = N;
      numCandidates = C;
      get = (i, c) => data[i * valuesPer + c] ?? 0;
    }
  } else if (dims.length === 2) {
    const [R, K] = dims as [number, number];
    if (K >= 5) {
      // [N, K]
      valuesPer = K;
      numCandidates = R;
      get = (i, c) => data[i * valuesPer + c] ?? 0;
    } else {
      // [K, N]
      valuesPer = R;
      numCandidates = K;
      get = (i, c) => data[c * numCandidates + i] ?? 0;
    }
  } else {
    valuesPer = 6;
    numCandidates = Math.floor(data.length / valuesPer);
    get = (i, c) => data[i * valuesPer + c] ?? 0;
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

export function toOriginalSpace(
  b: Box & { conf?: number },
  src: Size,
  scale: number,
  pad: { x: number; y: number },
  padPct: number
): Box {
  const x = (b.x - pad.x) / scale;
  const y = (b.y - pad.y) / scale;
  const w = b.w / scale;
  const h = b.h / scale;

  const px = Math.round(w * padPct);
  const py = Math.round(h * padPct);
  const x2 = Math.max(0, Math.min(src.w - 1, x - px));
  const y2 = Math.max(0, Math.min(src.h - 1, y - py));
  const w2 = Math.max(1, Math.min(src.w - x2, w + px * 2));
  const h2 = Math.max(1, Math.min(src.h - y2, h + py * 2));
  return { x: x2, y: y2, w: w2, h: h2 };
}

export function drawBox(
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

export type NatBox = { x: number; y: number; w: number; h: number };

/** Map a natural-image-space box to the Canvas display space (letterboxed contain). */
export function mapBoxToCanvas(
  b: NatBox,
  naturalW: number,
  naturalH: number,
  canvasW: number,
  canvasH: number
) {
  const canvasRatio = canvasW / canvasH;
  const imgRatio = naturalW / naturalH;

  let drawW: number,
    drawH: number,
    offsetX = 0,
    offsetY = 0,
    scale: number;

  if (imgRatio > canvasRatio) {
    // image is wider: full width, centered vertically
    drawW = canvasW;
    drawH = canvasW / imgRatio;
    offsetY = (canvasH - drawH) / 2;
    scale = drawW / naturalW;
  } else {
    // image is taller: full height, centered horizontally
    drawH = canvasH;
    drawW = canvasH * imgRatio;
    offsetX = (canvasW - drawW) / 2;
    scale = drawH / naturalH;
  }

  return {
    x: offsetX + b.x * scale,
    y: offsetY + b.y * scale,
    w: b.w * scale,
    h: b.h * scale,
  };
}

export function blurPatchWithMargin(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  x: number,
  y: number,
  w: number,
  h: number,
  strength0to100: number
) {
  // map slider 0..100 → blur radius ~1..40px (tweak 40 if you want more)
  const px = Math.max(1, Math.round((strength0to100 / 100) * 40));
  const m = Math.ceil(px * 2); // margin to avoid edge transparency

  // expanded source rect (clamped to image bounds)
  const sx = Math.max(0, x - m);
  const sy = Math.max(0, y - m);
  const sw = Math.min(img.naturalWidth - sx, w + 2 * m);
  const sh = Math.min(img.naturalHeight - sy, h + 2 * m);

  const off = document.createElement("canvas");
  off.width = sw;
  off.height = sh;
  const octx = off.getContext("2d");
  if (!octx) return;

  octx.filter = `blur(${px}px)`;
  octx.drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh);
  octx.filter = "none";

  // draw back, clipped to the original box
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();
  ctx.drawImage(off, sx, sy); // place in the same coords
  ctx.restore();
}

export function mapBoxesToCanvas(
  boxes: NatBox[],
  naturalW: number,
  naturalH: number,
  canvasW: number,
  canvasH: number
) {
  return boxes.map((b) =>
    mapBoxToCanvas(b, naturalW, naturalH, canvasW, canvasH)
  );
}

export function blurPatchWithFeather(
  ctx: CanvasRenderingContext2D,
  srcImg: HTMLImageElement,
  x: number,
  y: number,
  w: number,
  h: number,
  strength0to100: number,
  featherPx: number
) {
  const blurPx = Math.max(1, Math.round((strength0to100 / 100) * 40)); // 0..100 → ~1..40px
  const m = Math.ceil(blurPx * 2 + Math.max(0, featherPx)); // margin big enough for kernel + feather

  const sx = Math.max(0, Math.floor(x - m));
  const sy = Math.max(0, Math.floor(y - m));
  const sw = Math.min(srcImg.naturalWidth - sx, Math.ceil(w + 2 * m));
  const sh = Math.min(srcImg.naturalHeight - sy, Math.ceil(h + 2 * m));
  if (sw <= 0 || sh <= 0) return;

  // 1) blurred source patch
  const off = document.createElement("canvas");
  off.width = sw;
  off.height = sh;
  const octx = off.getContext("2d");
  if (!octx) return;
  octx.filter = `blur(${blurPx}px)`;
  octx.drawImage(srcImg, sx, sy, sw, sh, 0, 0, sw, sh);
  octx.filter = "none";

  // 2) build soft mask the size of the offscreen
  if (featherPx > 0) {
    const mask = document.createElement("canvas");
    mask.width = sw;
    mask.height = sh;
    const mctx = mask.getContext("2d")!;
    // local rect inside offscreen
    const rx = Math.max(0, Math.floor(x - sx));
    const ry = Math.max(0, Math.floor(y - sy));
    const rw = Math.min(sw, Math.ceil(w));
    const rh = Math.min(sh, Math.ceil(h));
    mctx.fillStyle = "#000";
    mctx.fillRect(0, 0, sw, sh); // start black
    mctx.fillStyle = "#fff";
    mctx.fillRect(rx, ry, rw, rh); // white rect where we want the blur
    mctx.filter = `blur(${featherPx}px)`;
    const blurredMask = document.createElement("canvas");
    blurredMask.width = sw;
    blurredMask.height = sh;
    const bmctx = blurredMask.getContext("2d")!;
    bmctx.filter = `blur(${featherPx}px)`;
    bmctx.drawImage(mask, 0, 0);
    bmctx.filter = "none";

    // 3) apply mask: keep only soft-rect region
    octx.globalCompositeOperation = "destination-in";
    octx.drawImage(blurredMask, 0, 0);
    octx.globalCompositeOperation = "source-over";
  } else {
    // no feather → keep a hard rect
    octx.globalCompositeOperation = "destination-in";
    const hard = document.createElement("canvas");
    hard.width = sw;
    hard.height = sh;
    const hctx = hard.getContext("2d")!;
    hctx.fillStyle = "#fff";
    hctx.fillRect(
      Math.max(0, Math.floor(x - sx)),
      Math.max(0, Math.floor(y - sy)),
      Math.min(sw, Math.ceil(w)),
      Math.min(sh, Math.ceil(h))
    );
    octx.drawImage(hard, 0, 0);
    octx.globalCompositeOperation = "source-over";
  }

  // 4) paint result back in image coordinates
  ctx.drawImage(off, sx, sy);
}

type WithConf = { conf?: number | string | null };

export function filterByMinConf<T extends WithConf>(
  arr: T[],
  min: number
): T[] {
  return arr.filter((item) => {
    const n =
      typeof item.conf === "number"
        ? item.conf
        : typeof item.conf === "string"
        ? parseFloat(item.conf)
        : NaN;
    return Number.isFinite(n) && n! >= min;
  });
}
