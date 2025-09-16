import { v4 as uuidv4 } from "uuid";
import { FaceBlurConstants } from "@/config/constants";

interface FaceApiCompatNS {
  nets: { tinyFaceDetector: { loadFromUri: (base: string) => Promise<void> } };
  TinyFaceDetectorOptions: new (opts: {
    scoreThreshold: number;
    inputSize: number;
  }) => unknown;
  detectAllFaces: (
    img: HTMLImageElement,
    opts: unknown
  ) => Promise<
    Array<{
      box: { x: number; y: number; width: number; height: number };
      score?: number;
    }>
  >;
}

export function blurPatchWithMargin(
  ctx: CanvasRenderingContext2D,
  srcImg: HTMLImageElement,
  x: number,
  y: number,
  w: number,
  h: number,
  strength0to100: number
) {
  const px = Math.max(1, Math.round((strength0to100 / 100) * 40));
  const m = Math.ceil(px * 2);

  const sx = Math.max(0, Math.floor(x - m));
  const sy = Math.max(0, Math.floor(y - m));
  const sw = Math.min(srcImg.naturalWidth - sx, Math.ceil(w + 2 * m));
  const sh = Math.min(srcImg.naturalHeight - sy, Math.ceil(h + 2 * m));
  if (sw <= 0 || sh <= 0) return;

  const off = document.createElement("canvas");
  off.width = sw;
  off.height = sh;
  const octx = off.getContext("2d");
  if (!octx) return;
  octx.filter = `blur(${px}px)`;
  octx.drawImage(srcImg, sx, sy, sw, sh, 0, 0, sw, sh);
  octx.filter = "none";

  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();
  ctx.drawImage(off, sx, sy); // place at the same image coords
  ctx.restore();
}

export function filterByScore(arr: FaceBox[], min: number): FaceBox[] {
  return arr.filter((f) => (typeof f.score === "number" ? f.score : 1) >= min);
}

import type { Box } from "@/types/detector-types";
export type FaceBox = Box & { score?: number; id: string; visible: boolean };

export const newFaceBox = (
  x: number,
  y: number,
  w: number,
  h: number,
  score?: number
): FaceBox => {
  return { id: uuidv4(), x, y, w, h, score, visible: true };
};

export function grow(r: FaceBox, pad: number, W: number, H: number): FaceBox {
  const dx = r.w * pad,
    dy = r.h * pad;
  const x = Math.max(0, r.x - dx);
  const y = Math.max(0, r.y - dy);
  const w = Math.min(W - x, r.w + 2 * dx);
  const h = Math.min(H - y, r.h + 2 * dy);
  return { ...r, x, y, w, h };
}

export const clamp = (n: number, lo: number, hi: number) =>
  Math.max(lo, Math.min(hi, n));

export function cssToCanvasRect(
  img: HTMLImageElement,
  canvas: HTMLCanvasElement,
  css: { x: number; y: number; width: number; height: number }
): FaceBox {
  const rect = img.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) {
    return newFaceBox(
      Math.round(css.x),
      Math.round(css.y),
      Math.round(css.width),
      Math.round(css.height)
    );
  }

  const sx = canvas.width / rect.width;
  const sy = canvas.height / rect.height;
  return newFaceBox(
    Math.round(css.x * sx),
    Math.round(css.y * sy),
    Math.round(css.width * sx),
    Math.round(css.height * sy)
  );
}

export function adjustUp(
  r: FaceBox,
  W: number,
  H: number,
  ratio = FaceBlurConstants.PAD_RATIO
): FaceBox {
  const shift = Math.round(r.h * ratio);
  const y = clamp(r.y - shift, 0, H);
  const h = clamp(r.h + shift, 1, H - y);
  return newFaceBox(r.x, y, r.w, h, r.score);
}

export function drawDebugBox(ctx: CanvasRenderingContext2D, r: FaceBox) {
  ctx.save();
  ctx.lineWidth = 2;
  ctx.strokeRect(r.x + 0.5, r.y + 0.5, r.w - 1, r.h - 1);
  ctx.restore();
}

export function blurPatchWithFeather(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  x: number,
  y: number,
  w: number,
  h: number,
  blurPx: number,
  featherPx: number
) {
  const W = ctx.canvas.width,
    H = ctx.canvas.height;
  // Use a generous margin so the blur kernel never samples transparent edges,
  // which can make the ellipse appear to "fade" at higher blur radii.
  // Empirically, ~3x blur radius + feather + small safety works well.
  const pad = Math.ceil(Math.max(0, blurPx) * 3.0 + Math.max(0, featherPx) + 8);
  const sx = clamp(Math.floor(x - pad), 0, W);
  const sy = clamp(Math.floor(y - pad), 0, H);
  const ex = clamp(Math.ceil(x + w + pad), 0, W);
  const ey = clamp(Math.ceil(y + h + pad), 0, H);
  const sw = ex - sx,
    sh = ey - sy;
  if (sw <= 0 || sh <= 0) return;

  // copy source patch
  const src = document.createElement("canvas");
  src.width = sw;
  src.height = sh;
  const sctx = src.getContext("2d");
  if (!sctx) return;
  // When close to edges, ensure we only sample inside the source image.
  sctx.drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh);

  // blur the patch (use multi-pass for large radii to avoid backend artifacts)
  const blurred = document.createElement("canvas");
  blurred.width = sw;
  blurred.height = sh;
  const bctx = blurred.getContext("2d");
  if (!bctx) return;
  const total = Math.max(0, Math.round(blurPx));
  if (total <= 0) {
    bctx.drawImage(src, 0, 0);
  } else {
    // Empirically, very large kernels can behave oddly on some drivers.
    // Split into smaller passes and re-apply to the accumulated result.
    const perPass = 20; // px per pass
    const passes = Math.max(1, Math.ceil(total / perPass));
    const step = Math.max(1, Math.round(total / passes));
    // First pass from source
    bctx.filter = `blur(${step}px)`;
    bctx.drawImage(src, 0, 0);
    // Subsequent passes from the blurred buffer itself (avoid self-source draw)
    if (passes > 1) {
      const tmp = document.createElement("canvas");
      tmp.width = sw;
      tmp.height = sh;
      const tctx = tmp.getContext("2d");
      if (tctx) {
        for (let i = 1; i < passes; i++) {
          tctx.clearRect(0, 0, sw, sh);
          tctx.drawImage(blurred, 0, 0);
          bctx.drawImage(tmp, 0, 0);
        }
      }
    }
    bctx.filter = "none";
  }

  // build an ellipse mask with optional feather
  const mask = document.createElement("canvas");
  mask.width = sw;
  mask.height = sh;
  const mctx = mask.getContext("2d");
  if (!mctx) return;

  const cx = x - sx + w / 2;
  const cy = y - sy + h / 2;
  const rx = Math.max(1, w / 2);
  const ry = Math.max(1, h / 2);
  mctx.save();
  mctx.translate(cx, cy);
  const R = Math.max(rx, ry);
  mctx.scale(rx / R, ry / R);
  if (featherPx <= 0) {
    // Solid ellipse exactly over the region
    mctx.fillStyle = "rgba(0,0,0,1)";
    mctx.beginPath();
    mctx.arc(0, 0, R, 0, Math.PI * 2);
    mctx.fill();
  } else {
    // Keep full opacity up to the original ellipse (R), feather OUTSIDE to R+feather
    const outer = R + featherPx;
    const grad = mctx.createRadialGradient(0, 0, R, 0, 0, outer);
    grad.addColorStop(0, "rgba(0,0,0,1)");
    grad.addColorStop(1, "rgba(0,0,0,0)");
    mctx.fillStyle = grad;
    mctx.beginPath();
    mctx.arc(0, 0, outer, 0, Math.PI * 2);
    mctx.fill();
  }
  mctx.restore();

  // apply mask to blurred patch (keep only inside ellipse)
  bctx.save();
  bctx.globalCompositeOperation = "destination-in";
  bctx.drawImage(mask, 0, 0);
  bctx.restore();

  // paint onto destination
  ctx.drawImage(blurred, sx, sy);
}

export function isFaceApiNS(x: unknown): x is FaceApiCompatNS {
  if (!x || typeof x !== "object") return false;
  const o = x as Record<string, unknown>;
  const hasDetect = typeof o["detectAllFaces"] === "function";
  const hasOpts = typeof o["TinyFaceDetectorOptions"] === "function";
  const nets = o["nets"] as Record<string, unknown> | undefined;
  const hasNet =
    !!nets && typeof nets === "object" && "tinyFaceDetector" in nets;
  return hasDetect && hasOpts && hasNet;
}
