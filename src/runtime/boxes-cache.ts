// src/runtime/boxes-cache.ts
import { get as idbGet, set as idbSet, del as idbDel } from "idb-keyval";
import { LRUCache } from "lru-cache";

// Use your canonical Box type
export type Box = { x: number; y: number; w: number; h: number; conf: number; cls?: number };

// Tune these for your app
const DEFAULT_TTL_MS = 60 * 60 * 1000; // 1 hour
const MAX_ITEMS = 200;

// One in-memory cache for speed
const mem = new LRUCache<string, ReadonlyArray<Box>>({
  max: MAX_ITEMS,
  ttl: DEFAULT_TTL_MS,
});

// Prefix for persistent keys
const prefix = "boxes:v1:"; // bump this if your Box shape changes

const keyFor = (k: string) => `${prefix}${k}`;

// Normalize input to the canonical shape
function normalize(b: Partial<Box>): Box {
  return {
    x: Number(b.x ?? 0),
    y: Number(b.y ?? 0),
    w: Number(b.w ?? 0),
    h: Number(b.h ?? 0),
    conf: Number(b.conf ?? 0),
    cls: b.cls !== undefined ? Number(b.cls) : 0,
  };
}

// Public API
export async function getBoxes(key: string): Promise<ReadonlyArray<Box> | undefined> {
  const k = keyFor(key);
  const cached = mem.get(k);
  if (cached) return cached;

  const raw = await idbGet(k);
  if (!raw) return;

  try {
    const arr = (raw as Array<Partial<Box>>).map(normalize);
    mem.set(k, arr);
    return arr;
  } catch {
    // corrupted entry — drop it
    await idbDel(k);
    return;
  }
}

export async function setBoxes(
  key: string,
  boxes: ReadonlyArray<Partial<Box>>,
  opts?: { ttlMs?: number }
): Promise<void> {
  const k = keyFor(key);
  const arr = boxes.map(normalize);
  mem.set(k, arr, { ttl: opts?.ttlMs ?? DEFAULT_TTL_MS });
  await idbSet(k, arr); // store normalized, so reads are fast
}

export async function clearBoxes(key?: string): Promise<void> {
  if (key) {
    const k = keyFor(key);
    mem.delete(k);
    await idbDel(k);
    return;
  }
  // Clear all (in-memory and IndexedDB for this namespace)
  mem.clear();
  // IndexedDB has no native prefix-scan; if you keep track of keys elsewhere, iterate those.
  // As a simple fallback, leave IDB entries (they’ll be ignored after you bump the prefix).
}

// Helper to build stable cache keys so boxes don’t mix between models/settings/images.
export function buildBoxesKey(params: {
  detector: "plate" | "face";
  modelUrl: string;
  modelSize: number;
  conf: number;
  iou: number;
  padRatio: number;
  imgHash: string; // hash blob or file; any stable string for the image
}): string {
  const { detector, modelUrl, modelSize, conf, iou, padRatio, imgHash } = params;
  // Keep it readable & deterministic
  return [
    detector,
    `u=${modelUrl}`,
    `sz=${modelSize}`,
    `c=${conf}`,
    `i=${iou}`,
    `p=${padRatio}`,
    `img=${imgHash}`,
  ].join("|");
}


