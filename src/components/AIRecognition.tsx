// src/components/AIRecognition.tsx
import React, { useCallback, useEffect, useRef, useState } from "react";
import { Form, Card, Spinner, Tabs, Tab } from "react-bootstrap";
import ModelsBadge from "./ModelsBadge"; // or "@/Components/ModelsBadge" if your folder is capitalized
import { CheckboxOption } from "./CheckboxOption";
import SliderControl from "./SliderControl";
import { Title } from "./Title";

// ========== Types
type Box = { x0: number; y0: number; x1: number; y1: number };
type TesseractModule = {
  createWorker?: (...args: unknown[]) => unknown | Promise<unknown>;
  recognize?: (img: unknown, lang?: unknown) => Promise<unknown>;
};
type WorkerLike = {
  loadLanguage?: (lang: string) => Promise<unknown>;
  initialize?: (lang: string) => Promise<unknown>;
  reinitialize?: (lang: string) => Promise<unknown>;
  setParameters?: (params: Record<string, unknown>) => Promise<unknown>;
  recognize: (img: unknown) => Promise<unknown>;
  terminate?: () => void | Promise<unknown>;
};

// ========== Helpers
function parseResult(result: unknown): {
  text: string;
  words: Box[];
  lines: Box[];
} {
  const root = result as { data?: unknown } | undefined;
  const data = (root?.data ?? root) as Record<string, unknown> | undefined;
  const text = typeof data?.text === "string" ? data.text : "";
  const asArr = (v: unknown) => (Array.isArray(v) ? (v as unknown[]) : []);
  const rawWords = asArr((data as Record<string, unknown> | undefined)?.words);
  const rawLines = asArr((data as Record<string, unknown> | undefined)?.lines);
  const rawSymbols = asArr(
    (data as Record<string, unknown> | undefined)?.symbols
  );
  const rawParagraphs = asArr(
    (data as Record<string, unknown> | undefined)?.paragraphs
  );

  const toNum = (n: unknown) =>
    typeof n === "number" ? n : typeof n === "string" ? Number(n) : NaN;
  const toBox = (item: unknown): Box | null => {
    const o = item as Record<string, unknown> | null | undefined;
    const bb = (o?.bbox ?? o?.box ?? o?.boundingBox ?? undefined) as
      | { x0?: unknown; y0?: unknown; x1?: unknown; y1?: unknown }
      | { x?: unknown; y?: unknown; width?: unknown; height?: unknown }
      | undefined;
    if (!bb) return null;
    if ("x0" in bb || "x1" in bb) {
      const x0 = toNum((bb as { x0?: unknown }).x0);
      const y0 = toNum((bb as { y0?: unknown }).y0);
      const x1 = toNum((bb as { x1?: unknown }).x1);
      const y1 = toNum((bb as { y1?: unknown }).y1);
      if ([x0, y0, x1, y1].every(Number.isFinite)) return { x0, y0, x1, y1 };
      return null;
    }
    const x = toNum((bb as { x?: unknown }).x);
    const y = toNum((bb as { y?: unknown }).y);
    const w = toNum((bb as { width?: unknown }).width);
    const h = toNum((bb as { height?: unknown }).height);
    if ([x, y, w, h].every(Number.isFinite))
      return { x0: x, y0: y, x1: x + w, y1: y + h };
    return null;
  };

  let words: Box[] = rawWords.map(toBox).filter((b): b is Box => Boolean(b));
  let lines: Box[] = rawLines.map(toBox).filter((b): b is Box => Boolean(b));
  if (!words.length && rawSymbols.length)
    words = rawSymbols.map(toBox).filter((b): b is Box => Boolean(b));
  if (!lines.length && rawParagraphs.length)
    lines = rawParagraphs.map(toBox).filter((b): b is Box => Boolean(b));
  return { text, words, lines };
}

// Helper: robust TSV parser (fixes CRLF regex + tab splits)
function parseTsv(tsv: string): { words: Box[]; lines: Box[] } {
  const words: Box[] = [];
  const lines: Box[] = [];
  if (!tsv) return { words, lines };

  // CRLF-safe row split and explicit TAB splits
  const rows = tsv.split(/\r?\n/);
  if (!rows.length) return { words, lines };

  const headers = rows[0].split("	");
  const idx = (k: string) => headers.indexOf(k);
  const iLevel = idx("level"),
    iL = idx("left"),
    iT = idx("top"),
    iW = idx("width"),
    iH = idx("height");

  for (let r = 1; r < rows.length; r++) {
    const row = rows[r];
    if (!row) continue;
    const cols = row.split("	");
    if ([iLevel, iL, iT, iW, iH].some((i) => i < 0 || i >= cols.length))
      continue;

    const level = Number(cols[iLevel]);
    const left = Number(cols[iL]);
    const top = Number(cols[iT]);
    const width = Number(cols[iW]);
    const height = Number(cols[iH]);
    if (![level, left, top, width, height].every(Number.isFinite)) continue;

    const box: Box = { x0: left, y0: top, x1: left + width, y1: top + height };
    if (level === 5) words.push(box); // word level
    else if (level === 4) lines.push(box); // line level
  }
  return { words, lines };
}

function ensureFaceDetector(): {
  detect?: (
    src: ImageBitmapSource
  ) => Promise<Array<{ boundingBox: DOMRectReadOnly }>>;
} {
  const FD = (globalThis as unknown as Record<string, unknown>).FaceDetector as
    | (new () => {
        detect: (
          src: ImageBitmapSource
        ) => Promise<Array<{ boundingBox: DOMRectReadOnly }>>;
      })
    | undefined;
  try {
    const inst = FD ? new FD() : null;
    return inst ? { detect: inst.detect.bind(inst) } : {};
  } catch {
    return {};
  }
}

function preprocessToCanvas(
  img: HTMLImageElement,
  opts: {
    brightnessPct: number;
    contrastPct: number;
    minWidth?: number;
    maxDim?: number;
  }
): HTMLCanvasElement {
  const { brightnessPct, contrastPct, minWidth = 64, maxDim = 1600 } = opts;
  const nw = img.naturalWidth || img.width;
  const nh = img.naturalHeight || img.height;
  if (!nw || !nh) throw new Error("Image not loaded");
  let scale = Math.max(1, minWidth / nw);
  let tw = Math.round(nw * scale);
  let th = Math.round(nh * scale);
  if (tw > maxDim || th > maxDim) {
    scale = Math.min(maxDim / nw, maxDim / nh);
    tw = Math.round(nw * scale);
    th = Math.round(nh * scale);
  }
  const cvs = document.createElement("canvas");
  cvs.width = tw;
  cvs.height = th;
  const ctx = cvs.getContext("2d");
  if (!ctx) throw new Error("2D context unavailable");
  ctx.filter = `brightness(${Math.max(1, brightnessPct)}%) contrast(${Math.max(
    1,
    contrastPct
  )}%)`;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(img, 0, 0, tw, th);
  return cvs;
}

// ========== Component
export default function AIRecognition() {
  // Refs
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const overlayRef = useRef<HTMLCanvasElement | null>(null);

  const tessRef = useRef<TesseractModule | null>(null);
  const workerRef = useRef<WorkerLike | null>(null);
  const faceRef = useRef<{
    detect?: (
      src: ImageBitmapSource
    ) => Promise<Array<{ boundingBox: DOMRectReadOnly }>>;
  }>({});

  // Basis for mapping boxes -> display coords
  const ocrBasisRef = useRef<{ w: number; h: number } | null>(null);
  const faceBasisRef = useRef<{ w: number; h: number } | null>(null);

  // State
  const [imageSrc, setImageSrc] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [ocrEnabled, setOcrEnabled] = useState(true);
  const [showWords, setShowWords] = useState(true);
  const [showLines, setShowLines] = useState(true);
  const [showFaces, setShowFaces] = useState(true);
  const [blurOCR, setBlurOCR] = useState(true);
  const [showMaskDebug, setShowMaskDebug] = useState(true); // keep on until confirmed

  const [ocrText, setOcrText] = useState<string>("");
  const [boxes, setBoxes] = useState<{
    words: Box[];
    lines: Box[];
    faces: Box[];
  }>({ words: [], lines: [], faces: [] });

  // Adjustments
  const [brightness, setBrightness] = useState(100);
  const [contrast, setContrast] = useState(100);

  // Init FaceDetector, cleanup worker
  useEffect(() => {
    faceRef.current = ensureFaceDetector();
  }, []);
  useEffect(
    () => () => {
      const w = workerRef.current;
      if (w?.terminate) void w.terminate();
    },
    []
  );

  // File interactions
  const pickImage = useCallback(() => fileInputRef.current?.click(), []);
  const onFileSelected = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const f = e.currentTarget.files?.[0];
      if (!f) return;
      const url = URL.createObjectURL(f);
      setImageSrc(url);
      setOcrText("");
      setBoxes({ words: [], lines: [], faces: [] });
      ocrBasisRef.current = null;
      faceBasisRef.current = null;
    },
    []
  );

  // Tesseract worker
  const ensureWorker = useCallback(async (): Promise<WorkerLike | null> => {
    if (workerRef.current) return workerRef.current;
    const mod = (await import("tesseract.js")) as unknown as TesseractModule;
    tessRef.current = mod;
    if (typeof mod.createWorker === "function") {
      const w = (await mod.createWorker()) as unknown as WorkerLike;
      if (w.loadLanguage && w.initialize) {
        await w.loadLanguage("eng");
        await w.initialize("eng");
      } else if (w.reinitialize) {
        await w.reinitialize("eng");
      }
      if (w.setParameters) {
        await w.setParameters({
          tessjs_create_tsv: "1",
          preserve_interword_spaces: "1",
          tessedit_pageseg_mode: "6",
          user_defined_dpi: "300",
        });
      }
      workerRef.current = w;
      return w;
    }
    return null;
  }, []);

  const doRecognize = useCallback(async () => {
    if (!imageSrc || !ocrEnabled) return;
    const img = imgRef.current;
    if (!img) return;
    setBusy(true);
    try {
      const pre = preprocessToCanvas(img, {
        brightnessPct: brightness,
        contrastPct: contrast,
        minWidth: 64,
        maxDim: 1600,
      });
      const worker = await ensureWorker();
      let result: unknown;
      if (worker) result = await worker.recognize(pre);
      else {
        const mod = tessRef.current;
        if (!mod || typeof mod.recognize !== "function")
          throw new Error("tesseract.js not available");
        result = await mod.recognize(pre, "eng");
      }
      const parsed = parseResult(result);
      let words = parsed.words;
      let lines = parsed.lines;
      const text = parsed.text;
      const tsv = (result as { data?: { tsv?: unknown } } | undefined)?.data
        ?.tsv;
      if (!words.length && !lines.length && typeof tsv === "string") {
        const via = parseTsv(tsv);
        words = via.words;
        lines = via.lines.length ? via.lines : lines;
      }
      ocrBasisRef.current = { w: pre.width, h: pre.height };
      setBoxes((b) => ({ ...b, words, lines }));
      setOcrText(text);
    } catch (err) {
      console.error(err);
    } finally {
      setBusy(false);
    }
  }, [imageSrc, ocrEnabled, brightness, contrast, ensureWorker]);

  const detectFaces = useCallback(async () => {
    const detect = faceRef.current.detect;
    const img = imgRef.current;
    if (!detect || !img) return;
    try {
      const pre = preprocessToCanvas(img, {
        brightnessPct: 100,
        contrastPct: 100,
        minWidth: 64,
        maxDim: 1600,
      });
      const rs = await detect(pre);
      const faces: Box[] = rs.map((r) => ({
        x0: r.boundingBox.x,
        y0: r.boundingBox.y,
        x1: r.boundingBox.x + r.boundingBox.width,
        y1: r.boundingBox.y + r.boundingBox.height,
      }));
      faceBasisRef.current = { w: pre.width, h: pre.height };
      setBoxes((b) => ({ ...b, faces }));
    } catch {
      /* ignore */
    }
  }, []);
  useEffect(() => {
    if (showFaces && imageSrc) void detectFaces();
  }, [showFaces, imageSrc, detectFaces]);

  // Draw overlays (blur + debug)
  const draw = useCallback(() => {
    const img = imgRef.current;
    const cvs = overlayRef.current;
    if (!img || !cvs) return;
    const width = img.clientWidth || img.naturalWidth;
    const height = img.clientHeight || img.naturalHeight;
    if (!width || !height) return;
    // Ensure CSS size matches pixel buffer (avoids invisible canvas in some layouts)
    cvs.style.width = `${width}px`;
    cvs.style.height = `${height}px`;
    cvs.width = width;
    cvs.height = height;
    const ctx = cvs.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, width, height);

    const mapFactor = (basis: { w: number; h: number } | null) => ({
      fx: width / (basis?.w ?? (img.naturalWidth || width)),
      fy: height / (basis?.h ?? (img.naturalHeight || height)),
    });
    const { fx: fxO, fy: fyO } = mapFactor(ocrBasisRef.current);
    const { fx: fxF, fy: fyF } = mapFactor(faceBasisRef.current);

    const mapBoxes = (arr: Box[], fx: number, fy: number) =>
      arr.map((b) => ({
        x: Math.round(b.x0 * fx),
        y: Math.round(b.y0 * fy),
        w: Math.round((b.x1 - b.x0) * fx),
        h: Math.round((b.y1 - b.y0) * fy),
      }));
    const wordsPx = mapBoxes(boxes.words, fxO, fyO);
    const linesPx = mapBoxes(boxes.lines, fxO, fyO);
    const facesPx = mapBoxes(boxes.faces, fxF, fyF);

    const maskRects = (linesPx.length ? linesPx : wordsPx).filter(
      (r) => r.w > 0 && r.h > 0
    );

    if (blurOCR && maskRects.length) {
      const off = document.createElement("canvas");
      off.width = width;
      off.height = height;
      const octx = off.getContext("2d");
      if (octx) {
        octx.filter = "blur(18px)";
        octx.drawImage(img, 0, 0, width, height);
        ctx.save();
        ctx.beginPath();
        for (const r of maskRects) ctx.rect(r.x, r.y, r.w, r.h);
        ctx.clip();
        ctx.drawImage(off, 0, 0);
        ctx.restore();
      }
    }

    if (showMaskDebug) {
      ctx.save();
      ctx.globalAlpha = 0.3;
      ctx.fillStyle = "#ff0033";
      const rects = maskRects.length
        ? maskRects
        : [
            {
              x: Math.round(width * 0.35),
              y: Math.round(height * 0.44),
              w: Math.round(width * 0.3),
              h: Math.round(height * 0.12),
            },
          ];
      for (const r of rects) ctx.fillRect(r.x, r.y, r.w, r.h);
      ctx.restore();
    }

    const stroke = (
      arr: { x: number; y: number; w: number; h: number }[],
      dash: number[],
      lw: number,
      color: string
    ) => {
      if (!arr.length) return;
      ctx.save();
      ctx.setLineDash(dash);
      ctx.lineWidth = lw;
      ctx.strokeStyle = color;
      for (const r of arr) ctx.strokeRect(r.x, r.y, r.w, r.h);
      ctx.restore();
    };
    if (showLines && linesPx.length) stroke(linesPx, [6, 4], 2, "#0d6efd");
    if (showWords && wordsPx.length) stroke(wordsPx, [], 1, "#0d6efd");
    if (showFaces && facesPx.length) stroke(facesPx, [3, 3], 2, "#198754");
  }, [
    boxes.words,
    boxes.lines,
    boxes.faces,
    showLines,
    showWords,
    showFaces,
    blurOCR,
    showMaskDebug,
  ]);
  useEffect(() => {
    draw();
  }, [draw]);
  const onImageLoad = useCallback(() => {
    draw();
  }, [draw]);

  return (
    <>
      <header
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 12,
        }}
      >
        <h1 className="h3 m-0">Photo Privacy Scrubber</h1>
        <ModelsBadge />
      </header>
      <Title action={() => {}} />

      <Card className="pps-tabs position-relative">
        <Card.Body>
          <Tabs defaultActiveKey="image" className="nav-tabs">
            <Tab eventKey="image" title="Image">
              <div className="mb-3">
                <Form.Group controlId="file">
                  <Form.Label>Choose an image</Form.Label>
                  <div className="d-flex gap-2">
                    <Form.Control
                      ref={fileInputRef}
                      type="file"
                      accept="image/*"
                      onChange={onFileSelected}
                      style={{ display: "none" }}
                    />
                    <Form.Control
                      readOnly
                      value={
                        imageSrc
                          ? imageSrc.split("/").slice(-1)[0]
                          : "No file chosen"
                      }
                    />
                    <button
                      type="button"
                      className="btn btn-outline-primary"
                      onClick={pickImage}
                    >
                      Browse…
                    </button>
                    <button
                      type="button"
                      className="btn btn-primary"
                      onClick={doRecognize}
                      disabled={!imageSrc || busy || !ocrEnabled}
                    >
                      Recognize
                    </button>
                  </div>
                </Form.Group>
              </div>

              {imageSrc && (
                <div
                  className="mt-3 position-relative"
                  style={{ display: "inline-block" }}
                >
                  <img
                    ref={imgRef}
                    src={imageSrc}
                    alt="Selected"
                    onLoad={onImageLoad}
                    style={{
                      maxWidth: "100%",
                      display: "block",
                      filter: `brightness(${brightness}%) contrast(${contrast}%)`,
                    }}
                  />
                  <canvas
                    ref={overlayRef}
                    className="position-absolute top-0 start-0"
                    style={{
                      pointerEvents: "none",
                      zIndex: 9999,
                      width: "100%",
                      height: "100%",
                    }}
                  />
                </div>
              )}

              {ocrText && (
                <Form.Group className="mt-3">
                  <Form.Label>Recognized Text</Form.Label>
                  <Form.Control
                    as="textarea"
                    rows={5}
                    readOnly
                    value={ocrText}
                  />
                </Form.Group>
              )}
            </Tab>

            <Tab eventKey="ocr" title="OCR & Faces">
              <div className="row g-3 pt-3">
                <div className="col-md-6">
                  <CheckboxOption
                    id="ocr-enabled"
                    label="Enable OCR"
                    checked={ocrEnabled}
                    onChange={setOcrEnabled}
                  />
                  <CheckboxOption
                    id="ocr-words"
                    label="Show Words"
                    checked={showWords}
                    onChange={setShowWords}
                  />
                  <CheckboxOption
                    id="ocr-lines"
                    label="Show Lines"
                    checked={showLines}
                    onChange={setShowLines}
                  />
                  <CheckboxOption
                    id="faces"
                    label="Show Faces"
                    checked={showFaces}
                    onChange={setShowFaces}
                  />
                  <CheckboxOption
                    id="blur-ocr"
                    label="Blur OCR regions"
                    checked={blurOCR}
                    onChange={setBlurOCR}
                  />
                  <CheckboxOption
                    id="mask-debug"
                    label="Show mask fill (debug)"
                    checked={showMaskDebug}
                    onChange={setShowMaskDebug}
                  />
                </div>
                <div className="col-md-6">
                  <Form.Text muted>
                    Hit <strong>Recognize</strong>. If you still don't see
                    rectangles, leave <em>mask fill (debug)</em> ON; you'll see
                    a red fallback box.
                  </Form.Text>
                </div>
              </div>
            </Tab>

            <Tab eventKey="adjust" title="Adjust">
              <div className="pt-3">
                <SliderControl
                  id="brightness"
                  label="Brightness"
                  value={brightness}
                  min={0}
                  max={200}
                  onChange={setBrightness}
                />
                <SliderControl
                  id="contrast"
                  label="Contrast"
                  value={contrast}
                  min={0}
                  max={200}
                  onChange={setContrast}
                />
              </div>
            </Tab>
          </Tabs>

          {busy && (
            <div
              className="pps-overlay position-absolute top-0 start-0 w-100 h-100 d-flex align-items-center justify-content-center"
              aria-hidden="true"
            >
              <Spinner animation="border" variant="secondary" />
            </div>
          )}
        </Card.Body>
      </Card>
    </>
  );
}
