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
