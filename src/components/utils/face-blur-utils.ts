export function blurPatchWithMargin(
  ctx: CanvasRenderingContext2D,
  srcImg: HTMLImageElement,
  x: number,
  y: number,
  w: number,
  h: number,
  strength0to100: number
) {
  const px = Math.max(1, Math.round((strength0to100 / 100) * 40)); // map 0..100 → ~1..40px
  const m = Math.ceil(px * 2); // margin to avoid edge transparency

  const sx = Math.max(0, Math.floor(x - m));
  const sy = Math.max(0, Math.floor(y - m));
  const sw = Math.min(srcImg.naturalWidth - sx, Math.ceil(w + 2 * m));
  const sh = Math.min(srcImg.naturalHeight - sy, Math.ceil(h + 2 * m));
  if (sw <= 0 || sh <= 0) return;

  // blur the expanded patch offscreen
  const off = document.createElement("canvas");
  off.width = sw;
  off.height = sh;
  const octx = off.getContext("2d");
  if (!octx) return;
  octx.filter = `blur(${px}px)`;
  octx.drawImage(srcImg, sx, sy, sw, sh, 0, 0, sw, sh);
  octx.filter = "none";

  // paint back, clipped to the original box
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();
  ctx.drawImage(off, sx, sy); // place at the same image coords
  ctx.restore();
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

export function filterByScore(arr: FaceBox[], min: number): FaceBox[] {
  return arr.filter((f) => (typeof f.score === "number" ? f.score : 1) >= min);
}

export type FaceBox = {
  x: number;
  y: number;
  w: number;
  h: number;
  score?: number;
};

export function cssToCanvasRect(
  img: HTMLImageElement,
  canvas: HTMLCanvasElement,
  r: { x: number; y: number; width: number; height: number }
): FaceBox {
  // FaceDetector reports CSS px; canvas draws in *internal* px
  const scaleX = canvas.width / img.clientWidth;
  const scaleY = canvas.height / img.clientHeight;
  return {
    x: r.x * scaleX,
    y: r.y * scaleY,
    w: r.width * scaleX,
    h: r.height * scaleY,
  };
}

export function grow(r: FaceBox, pad: number, W: number, H: number): FaceBox {
  const dx = r.w * pad,
    dy = r.h * pad;
  const x = Math.max(0, r.x - dx);
  const y = Math.max(0, r.y - dy);
  const w = Math.min(W - x, r.w + 2 * dx);
  const h = Math.min(H - y, r.h + 2 * dy);
  return { ...r, x, y, w, h };
}
