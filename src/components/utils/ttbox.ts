// Define TesseractBBox type locally since @tesseract-ocr/tesseract.js is not available
import type { BBox, TesseractBBox } from "../../types/bbox";

// Helper function to check if a value is a number
export const isNumber = (value: unknown): value is number => {
  return typeof value === "number";
};

export const hasBox = (b: unknown): b is TesseractBBox => {
  if (!b || typeof b !== "object") return false;
  const r = b as Record<string, unknown>;
  return isNumber(r.x0) && isNumber(r.y0) && isNumber(r.x1) && isNumber(r.y1);
};

export const toBBox = (bb: TesseractBBox): BBox => ({
  x: bb.x0,
  y: bb.y0,
  w: bb.x1 - bb.x0,
  h: bb.y1 - bb.y0,
});
