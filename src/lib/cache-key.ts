// cache-key.ts
export type DetectorKind = 'plate' | 'face';

export function basename(url: string): string {
  try {
    const p = new URL(url, window.location.origin);
    const name = p.pathname.split('/').pop() ?? url;
    return name;
  } catch {
    return url.split('/').pop() ?? url;
  }
}

export function round3(n: number): number {
  return Math.round(n * 1e3) / 1e3;
}

export function buildDetectorKey(
  kind: DetectorKind,
  modelUrl: string,
  opts: { modelSize: number; conf: number; iou: number; padRatio: number }
): string {
  return [
    kind,
    basename(modelUrl),
    opts.modelSize,
    round3(opts.conf),
    round3(opts.iou),
    round3(opts.padRatio),
  ].join(':');
}

// ---- hashing ----
async function sha256(ab: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', ab);
  const bytes = new Uint8Array(digest);
  return Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
}

/** Hash from a File quickly (real bytes). */
export async function hashFile(file: File): Promise<string> {
  return sha256(await file.arrayBuffer());
}

/** Hash from an <img>. Works for blob:, http(s):, and data: sources. */
export async function hashImageElement(img: HTMLImageElement): Promise<string> {
  const src = img.currentSrc || img.src;
  // Fast path for data: URLs
  if (src.startsWith('data:')) {
    // decode base64 to bytes
    const base64 = src.substring(src.indexOf(',') + 1);
    const raw = atob(base64);
    const buf = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i++) buf[i] = raw.charCodeAt(i);
    return sha256(buf.buffer);
  }
  // Blob or http(s)
  const res = await fetch(src, { cache: 'no-store' });
  const ab = await res.arrayBuffer();
  return sha256(ab);
}
