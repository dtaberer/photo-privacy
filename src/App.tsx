import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  createWorker,
  PSM,
  type Worker as TesseractWorker,
} from "tesseract.js";
import {
  FilesetResolver,
  FaceDetector,
  type FaceDetectorResult,
} from "@mediapipe/tasks-vision";
import {
  Container,
  Card,
  Form,
  Button,
  Stack,
  Row,
  Col,
  Spinner,
} from "react-bootstrap";

type BBox = { x: number; y: number; w: number; h: number };

type TesseractBBox = { x0: number; y0: number; x1: number; y1: number };
type OCRData = Partial<{
  words: Array<{ text?: string; bbox?: TesseractBBox }>;
  symbols: Array<{ text?: string; bbox?: TesseractBBox }>;
  lines: Array<{ bbox?: TesseractBBox }>;
  paragraphs: Array<{ bbox?: TesseractBBox }>;
  tsv: string;
}>;

const isNumber = (v: unknown): v is number =>
  typeof v === "number" && Number.isFinite(v);
const hasBox = (b: unknown): b is TesseractBBox => {
  if (!b || typeof b !== "object") return false;
  const r = b as Record<string, unknown>;
  return isNumber(r.x0) && isNumber(r.y0) && isNumber(r.x1) && isNumber(r.y1);
};
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

type StatusLevel = "info" | "success" | "warning" | "danger";

export default function App() {
  const [imageURL, setImageURL] = useState<string>("");
  const [blurFaces, setBlurFaces] = useState(true);
  const [blurText, setBlurText] = useState(true);
  const [busy, setBusy] = useState(false);
  const [cancellable, setCancellable] = useState(false);
  const [blurPx, setBlurPx] = useState<number>(14);
  const [status, setStatus] = useState<string>("");
  const [statusLevel, setStatusLevel] = useState<StatusLevel>("info");
  const [coverAlpha, setCoverAlpha] = useState<number>(0);
  const [coverColor, setCoverColor] = useState<string>("#1a1d2c");
  const [usePixelate, setUsePixelate] = useState<boolean>(true);
  const [blockSize, setBlockSize] = useState<number>(20);
  const [enhanceOCR, setEnhanceOCR] = useState<boolean>(true);
  const [plateMode, setPlateMode] = useState<boolean>(false);
  const [superResOCR, setSuperResOCR] = useState<boolean>(false);
  const [useGPU, setUseGPU] = useState<boolean>(false);
  const [debugOverlay, setDebugOverlay] = useState<boolean>(false);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const faceDetectorRef = useRef<FaceDetector | null>(null);
  const clearMsgTimeoutRef = useRef<number | null>(null);
  const cancelRef = useRef<boolean>(false);
  const ocrWorkerRef = useRef<TesseractWorker | null>(null);

  const PREFS_KEY = "pps_prefs_v1";
  useEffect(() => {
    try {
      const raw = localStorage.getItem(PREFS_KEY);
      if (!raw) return;
      const p = JSON.parse(raw) as Partial<Record<string, unknown>>;
      if (typeof p.blurFaces === "boolean") setBlurFaces(p.blurFaces);
      if (typeof p.blurText === "boolean") setBlurText(p.blurText);
      if (typeof p.usePixelate === "boolean") setUsePixelate(p.usePixelate);
      if (typeof p.enhanceOCR === "boolean") setEnhanceOCR(p.enhanceOCR);
      if (typeof p.useGPU === "boolean") setUseGPU(p.useGPU);
      if (typeof p.debugOverlay === "boolean") setDebugOverlay(p.debugOverlay);
      if (typeof p.plateMode === "boolean") setPlateMode(p.plateMode);
      if (typeof p.superResOCR === "boolean") setSuperResOCR(p.superResOCR);
      if (typeof p.blurPx === "number") setBlurPx(p.blurPx);
      if (typeof p.blockSize === "number") setBlockSize(p.blockSize);
      if (typeof p.coverAlpha === "number") setCoverAlpha(p.coverAlpha);
      if (typeof p.coverColor === "string") setCoverColor(p.coverColor);
    } catch {}
  }, []);
  useEffect(() => {
    try {
      const prefs = {
        blurFaces,
        blurText,
        usePixelate,
        enhanceOCR,
        useGPU,
        debugOverlay,
        plateMode,
        superResOCR,
        blurPx,
        blockSize,
        coverAlpha,
        coverColor,
      };
      localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
    } catch {}
  }, [
    blurFaces,
    blurText,
    usePixelate,
    enhanceOCR,
    useGPU,
    debugOverlay,
    plateMode,
    superResOCR,
    blurPx,
    blockSize,
    coverAlpha,
    coverColor,
  ]);

  const setStatusAuto = useCallback(
    (msg: string, level: StatusLevel = "info", delay = 1800) => {
      setStatus(msg);
      setStatusLevel(level);
      if (clearMsgTimeoutRef.current)
        window.clearTimeout(clearMsgTimeoutRef.current);
      clearMsgTimeoutRef.current = window.setTimeout(
        () => setStatus(""),
        delay
      );
    },
    []
  );

  useEffect(() => {
    return () => {
      if (clearMsgTimeoutRef.current)
        window.clearTimeout(clearMsgTimeoutRef.current);
    };
  }, []);

  const renderImageToCanvas = useCallback((url: string) => {
    const cvs = canvasRef.current;
    if (!cvs) return;
    const ctx = cvs.getContext("2d");
    if (!ctx) return;
    const img = new Image();
    img.onload = () => {
      const maxDisplayDim = 1600;
      const scale = Math.min(
        1,
        maxDisplayDim / Math.max(img.width, img.height)
      );
      const W = Math.round(img.width * scale);
      const H = Math.round(img.height * scale);
      cvs.width = W;
      cvs.height = H;
      ctx.clearRect(0, 0, W, H);
      ctx.drawImage(img, 0, 0, W, H);
    };
    img.src = url;
  }, []);

  useEffect(() => {
    let cancelled = false;
    let detectorToClose: FaceDetector | null = null;
    const init = async () => {
      try {
        setStatusAuto(
          `Loading face detector (${useGPU ? "GPU" : "CPU"})…`,
          "info",
          1400
        );
        const vision = await FilesetResolver.forVisionTasks(
          "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm"
        );
        if (cancelled) return;
        const detector = await FaceDetector.createFromOptions(vision, {
          baseOptions: {
            modelAssetPath:
              "https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/latest/blaze_face_short_range.tflite",
            delegate: useGPU ? "GPU" : "CPU",
          },
          runningMode: "IMAGE",
          minDetectionConfidence: 0.5,
          minSuppressionThreshold: 0.3,
        });
        detectorToClose = detector;
        if (!cancelled) faceDetectorRef.current = detector;
      } catch {}
    };
    void init();
    return () => {
      cancelled = true;
      try {
        if (detectorToClose && typeof detectorToClose.close === "function")
          detectorToClose.close();
      } catch {}
    };
  }, [useGPU, setStatusAuto]);

  useEffect(() => {
    return () => {
      if (imageURL) URL.revokeObjectURL(imageURL);
    };
  }, [imageURL]);

  useEffect(() => {
    if (!imageURL) return;
    renderImageToCanvas(imageURL);
  }, [imageURL, renderImageToCanvas]);

  const onFile = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const f = e.target.files?.[0];
      if (!f) return;
      if (imageURL) URL.revokeObjectURL(imageURL);
      const url = URL.createObjectURL(f);
      setImageURL(url);
      renderImageToCanvas(url);
      setStatus("");
    },
    [imageURL, renderImageToCanvas]
  );

  const triggerFilePick = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const ensureOCRWorker = useCallback(async (): Promise<TesseractWorker> => {
    if (ocrWorkerRef.current) return ocrWorkerRef.current;
    const worker = await createWorker("eng");
    await worker.setParameters({
      preserve_interword_spaces: "1",
      tessjs_create_tsv: "1",
      user_defined_dpi: "300",
    });
    ocrWorkerRef.current = worker;
    return worker;
  }, []);

  const terminateOCRWorker = useCallback(async () => {
    try {
      if (ocrWorkerRef.current) await ocrWorkerRef.current.terminate();
    } catch {}
    ocrWorkerRef.current = null;
  }, []);

  useEffect(() => {
    return () => {
      void terminateOCRWorker();
    };
  }, [terminateOCRWorker]);

  function parseWordTSV(tsv: string): Array<BBox & { text: string }> {
    const lines = tsv.split("\n");
    const header = (lines.shift() || "").split("\t");
    const idx: Record<string, number> = Object.fromEntries(
      header.map((h, i) => [h, i])
    );
    const out: Array<BBox & { text: string }> = [];
    for (const ln of lines) {
      if (!ln.trim()) continue;
      const cols = ln.split("\t");
      if (
        idx["level"] === undefined ||
        idx["text"] === undefined ||
        idx["left"] === undefined ||
        idx["top"] === undefined ||
        idx["width"] === undefined ||
        idx["height"] === undefined
      )
        continue;
      if (cols[idx["level"]] !== "5") continue;
      const text = (cols[idx["text"]] || "").trim();
      if (!text || text.length < 3) continue;
      const left = Number(cols[idx["left"]]);
      const top = Number(cols[idx["top"]]);
      const width = Number(cols[idx["width"]]);
      const height = Number(cols[idx["height"]]);
      out.push({ text, x: left, y: top, w: width, h: height });
    }
    return out;
  }

  const detectTextBoxesFullRes = useCallback(
    async (displayCvs: HTMLCanvasElement, srcUrl: string): Promise<BBox[]> => {
      const img = new Image();
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = () =>
          reject(new Error("Failed to load source image for OCR"));
        img.src = srcUrl;
      });
      const fullW = img.naturalWidth || img.width;
      const fullH = img.naturalHeight || img.height;
      const worker = await ensureOCRWorker();
      await worker.setParameters({
        user_defined_dpi: superResOCR ? "420" : "300",
      });
      if (plateMode)
        await worker.setParameters({
          tessedit_char_whitelist: "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789",
        });
      else await worker.setParameters({ tessedit_char_whitelist: "" });
      const runOnCanvas = async (
        source: HTMLCanvasElement
      ): Promise<BBox[]> => {
        const tryModes: PSM[] = plateMode
          ? [PSM.SINGLE_LINE, PSM.SPARSE_TEXT, PSM.SINGLE_WORD, PSM.AUTO]
          : [
              PSM.SPARSE_TEXT,
              PSM.SINGLE_LINE,
              PSM.SINGLE_BLOCK,
              PSM.SINGLE_WORD,
              PSM.AUTO,
            ];
        let words: BBox[] = [];
        for (const psm of tryModes) {
          if (cancelRef.current) break;
          await worker.setParameters({ tessedit_pageseg_mode: psm });
          const { data } = await worker.recognize(source);
          const d: OCRData = (data ?? {}) as OCRData;
          const fromWords: BBox[] = mapWords(d.words);
          const fromSymbols: BBox[] = mapSymbols(d.symbols);
          const fromLines: BBox[] = mapLines(d.lines);
          const fromParagraphs: BBox[] = mapParagraphs(d.paragraphs);
          const fromTSV: BBox[] =
            typeof d.tsv === "string"
              ? parseWordTSV(d.tsv).map((r) => ({
                  x: r.x,
                  y: r.y,
                  w: r.w,
                  h: r.h,
                }))
              : [];
          words = [
            ...fromWords,
            ...fromSymbols,
            ...fromLines,
            ...fromParagraphs,
            ...fromTSV,
          ].filter((b) => b.w * b.h >= 64);
          if (words.length) break;
        }
        return words;
      };
      const buildCanvas = (scale: number): HTMLCanvasElement => {
        const cw = Math.max(1, Math.round(fullW * scale));
        const ch = Math.max(1, Math.round(fullH * scale));
        const off = document.createElement("canvas");
        off.width = cw;
        off.height = ch;
        const octx = off.getContext("2d")!;
        octx.imageSmoothingEnabled = false;
        octx.drawImage(img, 0, 0, cw, ch);
        if (enhanceOCR) {
          const imgData = octx.getImageData(0, 0, cw, ch);
          const data = imgData.data;
          const n = cw * ch;
          const gray = new Uint8Array(n);
          const hist = new Uint32Array(256);
          for (let i = 0, p = 0; i < data.length; i += 4, p += 1) {
            const y = Math.round(
              0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]
            );
            gray[p] = y;
            hist[y]++;
          }
          let sum = 0;
          for (let t = 0; t < 256; t++) sum += t * hist[t];
          let sumB = 0,
            wB = 0,
            maxVar = -1,
            thr = 127;
          const total = n;
          for (let t = 0; t < 256; t++) {
            wB += hist[t];
            if (wB === 0) continue;
            const wF = total - wB;
            if (wF === 0) break;
            sumB += t * hist[t];
            const mB = sumB / wB;
            const mF = (sum - sumB) / wF;
            const between = wB * wF * (mB - mF) * (mB - mF);
            if (between > maxVar) {
              maxVar = between;
              thr = t;
            }
          }
          for (let i = 0, p = 0; i < data.length; i += 4, p += 1) {
            const v = gray[p] > thr ? 255 : 0;
            data[i] = v;
            data[i + 1] = v;
            data[i + 2] = v;
          }
          const copy = new Uint8ClampedArray(data);
          const W = cw,
            H = ch;
          for (let y = 1; y < H - 1; y++) {
            for (let x = 1; x < W - 1; x++) {
              const idx = (y * W + x) * 4;
              let maxv = 0;
              for (let dy = -1; dy <= 1; dy++)
                for (let dx = -1; dx <= 1; dx++) {
                  const ii = ((y + dy) * W + (x + dx)) * 4;
                  const vv = copy[ii];
                  if (vv > maxv) maxv = vv;
                }
              data[idx] = data[idx + 1] = data[idx + 2] = maxv;
            }
          }
          const copy2 = new Uint8ClampedArray(data);
          for (let y = 1; y < H - 1; y++) {
            for (let x = 1; x < W - 1; x++) {
              const idx = (y * W + x) * 4;
              let minv = 255;
              for (let dy = -1; dy <= 1; dy++)
                for (let dx = -1; dx <= 1; dx++) {
                  const ii = ((y + dy) * W + (x + dx)) * 4;
                  const vv = copy2[ii];
                  if (vv < minv) minv = vv;
                }
              data[idx] = data[idx + 1] = data[idx + 2] = minv;
            }
          }
          octx.putImageData(imgData, 0, 0);
        }
        return off;
      };
      const refMax = Math.max(fullW, fullH);
      const targetMin = superResOCR ? 3000 : 1600;
      const s1 = refMax < targetMin ? Math.min(2.5, targetMin / refMax) : 1;
      const canv1 = buildCanvas(s1);
      let boxes = await runOnCanvas(canv1);
      if (!boxes.length && s1 < 3 && !cancelRef.current) {
        const s2 = superResOCR
          ? Math.min(5, Math.max(3.5, 4000 / refMax))
          : Math.min(4, Math.max(3, 2000 / refMax));
        const canv2 = buildCanvas(s2);
        boxes = await runOnCanvas(canv2);
        if (boxes.length) {
          const scaleX = displayCvs.width / canv2.width;
          const scaleY = displayCvs.height / canv2.height;
          return boxes.map((b) => ({
            x: Math.round(b.x * scaleX),
            y: Math.round(b.y * scaleY),
            w: Math.round(b.w * scaleX),
            h: Math.round(b.h * scaleY),
          }));
        }
      }
      const scaleX = displayCvs.width / canv1.width;
      const scaleY = displayCvs.height / canv1.height;
      return boxes.map((b) => ({
        x: Math.round(b.x * scaleX),
        y: Math.round(b.y * scaleY),
        w: Math.round(b.w * scaleX),
        h: Math.round(b.h * scaleY),
      }));
    },
    [enhanceOCR, ensureOCRWorker, plateMode, superResOCR]
  );

  function drawDebugOverlay(
    ctx: CanvasRenderingContext2D,
    faces: BBox[],
    texts: BBox[]
  ) {
    const FACE_COLOR = "#e63946";
    const TEXT_COLOR = "#1d4ed8";
    const drawLabel = (x: number, y: number, label: string, color: string) => {
      ctx.save();
      ctx.font =
        "bold 12px system-ui, -apple-system, Segoe UI, Roboto, sans-serif";
      ctx.textBaseline = "top";
      const padX = 4;
      const padY = 2;
      const textW = Math.ceil(ctx.measureText(label).width);
      const boxW = textW + padX * 2;
      const boxH = 14 + padY * 2;
      const clampedX = Math.max(0, Math.min(ctx.canvas.width - boxW, x));
      const clampedY = Math.max(0, Math.min(ctx.canvas.height - boxH, y));
      ctx.fillStyle = "rgba(0,0,0,0.65)";
      ctx.fillRect(clampedX, clampedY, boxW, boxH);
      ctx.fillStyle = color;
      ctx.fillText(label, clampedX + padX, clampedY + padY);
      ctx.restore();
    };
    const drawLegend = () => {
      ctx.save();
      const items: Array<{ label: string; color: string }> = [
        { label: "face", color: FACE_COLOR },
        { label: "text", color: TEXT_COLOR },
      ];
      ctx.font =
        "bold 12px system-ui, -apple-system, Segoe UI, Roboto, sans-serif";
      const pad = 8;
      const lineH = 18;
      const swatch = 14;
      const width = 140;
      const height = pad * 2 + items.length * lineH;
      const x0 = 10;
      const y0 = 10;
      ctx.fillStyle = "rgba(0,0,0,0.45)";
      ctx.fillRect(x0, y0, width, height);
      items.forEach((it, i) => {
        const y = y0 + pad + i * lineH;
        ctx.fillStyle = it.color;
        ctx.fillRect(x0 + pad, y + 2, swatch, swatch);
        ctx.fillStyle = "#ffffff";
        ctx.fillText(it.label, x0 + pad + swatch + 8, y + 2);
      });
      ctx.restore();
    };
    ctx.save();
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 4]);
    ctx.strokeStyle = FACE_COLOR;
    faces.forEach((r) => {
      ctx.strokeRect(r.x, r.y, r.w, r.h);
      drawLabel(r.x, r.y - 18, "face", "#ffffff");
    });
    ctx.strokeStyle = TEXT_COLOR;
    texts.forEach((r) => {
      ctx.strokeRect(r.x, r.y, r.w, r.h);
      drawLabel(r.x, r.y - 18, "text", "#ffffff");
    });
    drawLegend();
    ctx.restore();
  }

  function pixelateRegion(
    ctx: CanvasRenderingContext2D,
    img: HTMLImageElement,
    r: BBox,
    block: number
  ) {
    const pad = Math.ceil(block / 2);
    const rx = Math.max(0, Math.floor(r.x - pad));
    const ry = Math.max(0, Math.floor(r.y - pad));
    const rw = Math.max(
      1,
      Math.min(ctx.canvas.width - rx, Math.floor(r.w + pad * 2))
    );
    const rh = Math.max(
      1,
      Math.min(ctx.canvas.height - ry, Math.floor(r.h + pad * 2))
    );
    const off = document.createElement("canvas");
    const ow = Math.max(1, Math.floor(rw / block));
    const oh = Math.max(1, Math.floor(rh / block));
    off.width = ow;
    off.height = oh;
    const octx = off.getContext("2d");
    if (!octx) return;
    octx.imageSmoothingEnabled = false;
    octx.drawImage(img, rx, ry, rw, rh, 0, 0, ow, oh);
    const smoothingBefore = ctx.imageSmoothingEnabled;
    ctx.save();
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(off, 0, 0, ow, oh, rx, ry, rw, rh);
    ctx.imageSmoothingEnabled = smoothingBefore;
    ctx.restore();
  }

  const cancelProcess = useCallback(async () => {
    cancelRef.current = true;
    setCancellable(false);
    setBusy(false);
    setStatusAuto("Cancelled.", "warning", 1500);
    await terminateOCRWorker();
  }, [setStatusAuto, terminateOCRWorker]);

  const process = useCallback(async () => {
    if (!imageURL) return;
    cancelRef.current = false;
    setCancellable(true);
    setBusy(true);
    setStatusAuto("Loading image…", "info", 1000);
    const img = new Image();
    img.onload = async () => {
      try {
        if (cancelRef.current) return;
        const maxDisplayDim = 1600;
        const scale = Math.min(
          1,
          maxDisplayDim / Math.max(img.width, img.height)
        );
        const W = Math.round(img.width * scale);
        const H = Math.round(img.height * scale);
        const cvs = canvasRef.current;
        if (!cvs) {
          setStatusAuto("Canvas not ready.", "danger", 2500);
          return;
        }
        const ctx = cvs.getContext("2d");
        if (!ctx) {
          setStatusAuto("Canvas 2D not supported.", "danger", 2500);
          return;
        }
        cvs.width = W;
        cvs.height = H;
        ctx.clearRect(0, 0, W, H);
        ctx.drawImage(img, 0, 0, W, H);
        const faceBoxes: BBox[] = [];
        if (blurFaces && faceDetectorRef.current && !cancelRef.current) {
          try {
            setStatusAuto("Detecting faces…", "info", 1200);
            const res: FaceDetectorResult = faceDetectorRef.current.detect(cvs);
            for (const d of res?.detections ?? []) {
              const bb = d.boundingBox;
              if (!bb) continue;
              const pad = 4;
              const x = Math.max(0, Math.floor(bb.originX - pad));
              const y = Math.max(0, Math.floor(bb.originY - pad));
              const w = Math.min(W - x, Math.floor(bb.width + pad * 2));
              const h = Math.min(H - y, Math.floor(bb.height + pad * 2));
              faceBoxes.push({ x, y, w, h });
            }
          } catch {}
        }
        const textBoxes: BBox[] = [];
        if (blurText && !cancelRef.current) {
          setStatusAuto("Reading text (OCR)…", "info", 1600);
          try {
            const boxes = await detectTextBoxesFullRes(cvs, imageURL);
            if (!cancelRef.current) textBoxes.push(...boxes);
          } catch {}
        }
        if (cancelRef.current) return;
        const regions = [...faceBoxes, ...textBoxes];
        setStatusAuto(
          regions.length
            ? "Scrubbing sensitive regions…"
            : "No faces/text found.",
          regions.length ? "info" : "warning",
          regions.length ? 1200 : 2000
        );
        for (const r of regions) {
          if (cancelRef.current) break;
          if (usePixelate) {
            pixelateRegion(ctx, img, r, Math.max(4, Math.floor(blockSize)));
          } else {
            ctx.save();
            ctx.beginPath();
            ctx.rect(r.x, r.y, r.w, r.h);
            ctx.clip();
            ctx.filter = `blur(${Math.max(0, Math.floor(blurPx))}px)`;
            ctx.drawImage(img, 0, 0, W, H);
            ctx.restore();
          }
          if (coverAlpha > 0) {
            ctx.save();
            ctx.globalAlpha = Math.min(0.95, Math.max(0, coverAlpha));
            ctx.fillStyle = coverColor;
            ctx.fillRect(r.x, r.y, r.w, r.h);
            ctx.restore();
          }
        }
        if (!cancelRef.current && debugOverlay) {
          drawDebugOverlay(ctx, faceBoxes, textBoxes);
        }
        if (!cancelRef.current) setStatusAuto("Done.", "success", 1800);
      } finally {
        setBusy(false);
        setCancellable(false);
      }
    };
    img.onerror = () => {
      setBusy(false);
      setCancellable(false);
      setStatusAuto("Failed to load image.", "danger", 2600);
    };
    img.src = imageURL;
  }, [
    imageURL,
    blurFaces,
    blurText,
    usePixelate,
    blockSize,
    coverAlpha,
    coverColor,
    blurPx,
    detectTextBoxesFullRes,
    debugOverlay,
    setStatusAuto,
  ]);

  const download = useCallback(() => {
    const cvs = canvasRef.current;
    if (!cvs) return;
    const url = cvs.toDataURL("image/jpeg", 0.92);
    const a = document.createElement("a");
    a.href = url;
    a.download = "scrubbed.jpg";
    a.click();
  }, []);

  function Title() {
    const statusColors: Record<StatusLevel, string> = {
      info: "rgba(255,255,255,.92)",
      success: "#bbf7d0",
      warning: "#fde68a",
      danger: "#fecaca",
    };
    return (
      <div className="pps-hero my-3">
        <style>{`
          .pps-hero{position:relative;border-radius:24px;padding:40px;margin-bottom:16px;overflow:hidden;color:#fff;background:
            radial-gradient(1200px 500px at 10% -20%, rgba(255,255,255,.25), transparent 60%),
            linear-gradient(135deg,#0ea5e9 0%,#6366f1 40%,#8b5cf6 70%,#ec4899 100%);
          }
          .pps-hero::after{content:"";position:absolute;inset:-50%;background:conic-gradient(from 0deg at 50% 50%, rgba(255,255,255,.12), transparent 25%, rgba(255,255,255,.12), transparent 50%);filter:blur(80px);opacity:.25;animation:pps-spin 30s linear infinite}
          @keyframes pps-spin{to{transform:rotate(1turn)}}
          .pps-badges{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px}
          .pps-pill{backdrop-filter:blur(6px);background:rgba(255,255,255,.14);border:1px solid rgba(255,255,255,.28);border-radius:9999px;padding:6px 10px;font-size:12px;color:#fff}
          .pps-heading{font-weight:800;letter-spacing:-.02em;margin:0;line-height:1.05;font-size:clamp(28px,6vw,56px);background:linear-gradient(90deg,#fff 0%,#dbeafe 40%,#c7d2fe 70%,#fbcfe8 100%);-webkit-background-clip:text;background-clip:text;color:transparent}
          .pps-subtitle{margin-top:8px;margin-bottom:16px;color:rgba(255,255,255,.92);font-size:clamp(14px,2vw,18px)}
          .pps-actions{display:flex;gap:12px;flex-wrap:wrap}
          .pps-shield{position:absolute;right:-40px;bottom:-40px;width:260px;height:auto;opacity:.18;filter:drop-shadow(0 4px 40px rgba(0,0,0,.45))}
        `}</style>
        <div className="pps-badges">
          <span className="pps-pill">Local-only</span>
          <span className="pps-pill">No uploads</span>
          <span className="pps-pill">Face + OCR</span>
        </div>
        <h1 className="pps-heading">Photo Privacy Scrubber</h1>
        <p className="pps-subtitle">
          Blur or pixelate faces and text locally. No uploads.
        </p>
        <div className="pps-actions">
          <div className="d-flex flex-column align-items-start">
            <Button
              variant="light"
              aria-label="Select image file"
              aria-controls="file-input-hidden"
              onClick={triggerFilePick}
              disabled={busy}
            >
              Select image
            </Button>
            {cancellable && (
              <Button
                variant="link"
                className="text-white-75 p-0 mt-2"
                onClick={cancelProcess}
                aria-label="Cancel processing"
              >
                Cancel
              </Button>
            )}
          </div>
          <div className="d-flex align-items-center gap-2 flex-wrap">
            <Button
              variant="outline-light"
              onClick={process}
              disabled={!imageURL || busy}
            >
              {busy && (
                <Spinner
                  animation="border"
                  role="status"
                  size="sm"
                  className="me-2"
                  aria-hidden="true"
                />
              )}
              AI Scrub Image...
            </Button>
            {status && (
              <div
                className="ms-2"
                style={{
                  color: statusColors[statusLevel],
                  fontSize: 13,
                  lineHeight: 1.2,
                  whiteSpace: "nowrap",
                  opacity:
                    statusLevel === "warning" || statusLevel === "danger"
                      ? 1
                      : 0.6,
                  fontWeight:
                    statusLevel === "warning" || statusLevel === "danger"
                      ? 600
                      : 400,
                }}
                aria-live="polite"
              >
                {status}
              </div>
            )}
          </div>
        </div>
        <img
          className="pps-shield"
          alt=""
          aria-hidden="true"
          src={
            "data:image/svg+xml;utf8," +
            encodeURIComponent(`<?xml version='1.0' encoding='UTF-8'?>
          <svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'>
            <path fill='#ffffff' fill-opacity='0.85' d='M12 2l7 3v6c0 5-3.5 9.7-7 11-3.5-1.3-7-6-7-11V5l7-3z'/>
            <path fill='#0ea5e9' fill-opacity='0.8' d='M12 4.2l5 2.2v4.5c0 4-2.8 7.7-5 8.9-2.2-1.2-5-4.9-5-8.9V6.4l5-2.2z'/>
            <path fill='#ffffff' fill-opacity='0.95' d='M11 11.5c0-.83.67-1.5 1.5-1.5S14 10.67 14 11.5V13h1.25c.41 0 .75.34.75.75v1.5c0 .41-.34.75-.75.75H9.75A.75.75 0 019 15.25v-1.5c0-.41.34-.75.75-.75H11v-1.5z'/>
          </svg>`)
          }
        />
      </div>
    );
  }

  function CheckboxOptions() {
    return (
      <Card className="mb-3 shadow-sm border-0" style={{ overflow: "hidden" }}>
        <Card.Header className="bg-light fw-semibold">Options</Card.Header>
        <Card.Body>
          <div className="d-flex flex-wrap gap-4">
            <div className="d-flex flex-column" style={{ minWidth: 220 }}>
              <Form.Check
                type="switch"
                id="opt-faces"
                label="Blur Faces"
                checked={blurFaces}
                disabled={busy}
                onChange={(e) => setBlurFaces(e.target.checked)}
              />
              <small className="text-muted">Hide detected faces.</small>
            </div>
            <div className="d-flex flex-column" style={{ minWidth: 220 }}>
              <Form.Check
                type="switch"
                id="opt-text"
                label="Blur Text (plates, signs)"
                checked={blurText}
                disabled={busy}
                onChange={(e) => setBlurText(e.target.checked)}
              />
              <small className="text-muted">
                Detect signage & plates via OCR.
              </small>
            </div>
            <div className="d-flex flex-column" style={{ minWidth: 220 }}>
              <Form.Check
                type="switch"
                id="opt-pixel"
                label="Pixelate"
                checked={usePixelate}
                disabled={busy}
                onChange={(e) => setUsePixelate(e.target.checked)}
              />
              <small className="text-muted">
                Use pixelation instead of blur.
              </small>
            </div>
            <div className="d-flex flex-column" style={{ minWidth: 220 }}>
              <Form.Check
                type="switch"
                id="opt-ocr-enhance"
                label="High contrast for OCR"
                checked={enhanceOCR}
                disabled={busy || !blurText}
                onChange={(e) => setEnhanceOCR(e.target.checked)}
              />
              <small className="text-muted">
                Grayscale + Otsu threshold improves small text.
              </small>
            </div>
            <div className="d-flex flex-column" style={{ minWidth: 260 }}>
              <Form.Check
                type="switch"
                id="opt-plate"
                label="License plate mode"
                checked={plateMode}
                disabled={busy || !blurText}
                onChange={(e) => setPlateMode(e.target.checked)}
              />
              <small className="text-muted">
                Forces line detection + A–Z/0–9 whitelist.
              </small>
            </div>
            <div className="d-flex flex-column" style={{ minWidth: 260 }}>
              <Form.Check
                type="switch"
                id="opt-superres"
                label="Super‑res OCR (slower)"
                checked={superResOCR}
                disabled={busy || !blurText}
                onChange={(e) => setSuperResOCR(e.target.checked)}
              />
              <small className="text-muted">
                Upscales more aggressively for tiny text.
              </small>
            </div>
            <div className="d-flex flex-column" style={{ minWidth: 260 }}>
              <Form.Check
                type="switch"
                id="opt-gpu"
                label="GPU acceleration (MediaPipe)"
                checked={useGPU}
                disabled={busy}
                onChange={(e) => setUseGPU(e.target.checked)}
              />
              <small className="text-muted">
                CPU is quieter; GPU is faster but may log WebGL.
              </small>
            </div>
            <div className="d-flex flex-column" style={{ minWidth: 260 }}>
              <Form.Check
                type="switch"
                id="opt-debug"
                label="Debug overlay (show boxes)"
                checked={debugOverlay}
                disabled={busy}
                onChange={(e) => setDebugOverlay(e.target.checked)}
              />
              <small className="text-muted">
                Draw labeled boxes for faces (red) & text (blue).
              </small>
            </div>
          </div>
        </Card.Body>
      </Card>
    );
  }

  type SliderControlProps = {
    id: string;
    label: string;
    min: number;
    max: number;
    step?: number;
    value: number;
    unit?: string;
    disabled?: boolean;
    onChange: (n: number) => void;
  };

  function SliderControl({
    id,
    label,
    min,
    max,
    step = 1,
    value,
    unit,
    disabled,
    onChange,
  }: SliderControlProps) {
    return (
      <div className="my-2">
        <Stack direction="horizontal" gap={3} className="align-items-center">
          <Form.Label htmlFor={id} className="mb-0" style={{ minWidth: 160 }}>
            {label}
          </Form.Label>
          <Form.Range
            id={id}
            className="flex-grow-1"
            min={min}
            max={max}
            step={step}
            value={value}
            onChange={(e) => onChange(Number(e.currentTarget.value))}
            disabled={disabled}
          />
          <span style={{ width: 60, textAlign: "right" }}>{`${value}${
            unit ?? ""
          }`}</span>
        </Stack>
      </div>
    );
  }

  function SliderControls() {
    return (
      <Card className="mb-3 shadow-sm border-0" style={{ overflow: "hidden" }}>
        <Card.Header className="bg-light fw-semibold">
          Redaction settings
        </Card.Header>
        <Card.Body>
          <div className="mt-2">
            <SliderControl
              id="s-blur"
              label="Blur amount (px)"
              min={0}
              max={40}
              step={1}
              value={blurPx}
              onChange={setBlurPx}
              unit="px"
              disabled={busy || usePixelate}
            />
            {usePixelate && (
              <SliderControl
                id="s-block"
                label="Pixel block size"
                min={4}
                max={60}
                step={2}
                value={blockSize}
                onChange={setBlockSize}
                unit="px"
                disabled={busy}
              />
            )}
            <Stack
              direction="horizontal"
              gap={3}
              className="align-items-center mt-3"
            >
              <Form.Label
                htmlFor="s-overlay"
                className="mb-0"
                style={{ minWidth: 160 }}
              >
                Overlay color / opacity
              </Form.Label>
              <Form.Control
                id="s-overlay-color"
                type="color"
                aria-label="Overlay color"
                value={coverColor}
                title="Overlay color"
                onChange={(e) => setCoverColor(e.target.value)}
                style={{ width: 56, height: 32, padding: 0 }}
                disabled={busy}
              />
              <Form.Range
                id="s-overlay"
                className="flex-grow-1"
                min={0}
                max={95}
                step={5}
                value={Math.round(coverAlpha * 100)}
                onChange={(e) =>
                  setCoverAlpha(Number(e.currentTarget.value) / 100)
                }
                disabled={busy}
              />
              <span style={{ width: 60, textAlign: "right" }}>{`${Math.round(
                coverAlpha * 100
              )}%`}</span>
            </Stack>
            <small className="text-muted d-block mt-2">
              Overlay adds a solid tint on top of blurred/pixelated regions for
              stronger obfuscation.
            </small>
          </div>
        </Card.Body>
      </Card>
    );
  }

  function ActionButtons() {
    return (
      <div className="d-flex gap-2 my-3">
        <Button
          variant="secondary"
          onClick={download}
          disabled={!imageURL || busy}
        >
          Download Scrubbed Image
        </Button>
      </div>
    );
  }

  useEffect(() => {
    const tsv = [
      "level\tleft\ttop\twidth\theight\ttext",
      "5\t100\t200\t50\t20\tDORITO",
      "5\t300\t400\t60\t22\tROAD",
    ].join("\n");
    const boxes = parseWordTSV(tsv);
    console.assert(boxes.length === 2, "parseWordTSV should return 2 boxes");
    console.assert(boxes[0].w === 50 && boxes[0].h === 20, "box dims parsed");
  }, []);

  return (
    <Container className="py-3">
      <Title />
      <input
        ref={fileInputRef}
        id="file-input-hidden"
        type="file"
        accept="image/*"
        onChange={onFile}
        hidden
        style={{ display: "none" }}
        tabIndex={-1}
        aria-hidden="true"
      />
      <Card>
        <Card.Body>
          <Form>
            <Row className="g-4">
              <Col lg={5}>
                <CheckboxOptions />
                <SliderControls />
                <ActionButtons />
              </Col>
              <Col lg={7}>
                <canvas
                  ref={canvasRef}
                  role="img"
                  aria-label="Processed image preview"
                  style={{
                    width: "100%",
                    border: "1px solid #ddd",
                    borderRadius: 8,
                    maxHeight: 800,
                  }}
                />
              </Col>
            </Row>
          </Form>
        </Card.Body>
      </Card>
    </Container>
  );
}
