// -------------------- Types --------------------
type BBox = { x: number; y: number; w: number; h: number };

// Minimal Tesseract result shapes (avoid `any`)
type TesseractBBox = { x0: number; y0: number; x1: number; y1: number };

type OCRData = Partial<{
  words: Array<{ text?: string; bbox?: TesseractBBox }>;
  symbols: Array<{ text?: string; bbox?: TesseractBBox }>;
  lines: Array<{ bbox?: TesseractBBox }>;
  paragraphs: Array<{ bbox?: TesseractBBox }>;
  tsv: string;
}>;

// Type guards / mappers
const isNumber = (v: unknown): v is number =>
  typeof v === "number" && Number.isFinite(v);

const hasBox = (b: unknown): b is TesseractBBox => {
  if (!b || typeof b !== "object") return false;

  const r = b as Record<string, unknown>;
  return isNumber(r.x0) && isNumber(r.y0) && isNumber(r.x1) && isNumber(r.y1);
};

type StatusLevel = "info" | "success" | "warning" | "danger";

const toBBox = (bb: TesseractBBox): BBox => ({
  x: bb.x0,
  y: bb.y0,
  w: bb.x1 - bb.x0,
  h: bb.y1 - bb.y0,
});

const mapWords = (
  arr?: Array<{ text?: string; bbox?: TesseractBBox }>
): BBox[] => {
  if (!Array.isArray(arr)) return [];
  const out: BBox[] = [];
  for (const w of arr) {
    const t = (w?.text ?? "").trim();
    if (t.length < 1) continue;
    if (hasBox(w?.bbox)) out.push(toBBox(w!.bbox as TesseractBBox));
  }
  return out;
};
const mapSymbols = (
  arr?: Array<{ text?: string; bbox?: TesseractBBox }>
): BBox[] => {
  if (!Array.isArray(arr)) return [];
  const out: BBox[] = [];
  for (const s of arr) {
    const t = (s?.text ?? "").trim();
    if (t.length < 1) continue;
    if (hasBox(s?.bbox)) out.push(toBBox(s!.bbox as TesseractBBox));
  }
  return out;
};
const mapLines = (arr?: Array<{ bbox?: TesseractBBox }>): BBox[] => {
  if (!Array.isArray(arr)) return [];
  return arr
    .map((l) => l?.bbox)
    .filter(hasBox)
    .map((bb) => toBBox(bb as TesseractBBox));
};
const mapParagraphs = (arr?: Array<{ bbox?: TesseractBBox }>): BBox[] => {
  if (!Array.isArray(arr)) return [];
  return arr
    .map((p) => p?.bbox)
    .filter(hasBox)
    .map((bb) => toBBox(bb as TesseractBBox));
};
