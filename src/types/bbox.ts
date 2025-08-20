export type BBox = { x: number; y: number; w: number; h: number };

export type TesseractBBox = { x0: number; y0: number; x1: number; y1: number };

export type OCRData = Partial<{
  words: Array<{ text?: string; bbox?: TesseractBBox }>;
  symbols: Array<{ text?: string; bbox?: TesseractBBox }>;
  lines: Array<{ bbox?: TesseractBBox }>;
  paragraphs: Array<{ bbox?: TesseractBBox }>;
  tsv: string;
}>;
