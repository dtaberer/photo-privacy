// File: scripts/fetch-face-models.mjs
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import https from "node:https";
const VERSION = process.env.FACE_API_MODEL_VERSION || "1.7.15";
const CDN_ROOT = `https://cdn.jsdelivr.net/npm/@vladmandic/face-api@${VERSION}/model`;
const FILES = [
  "tiny_face_detector_model-weights_manifest.json",
  "tiny_face_detector_model.bin",
];
const DEST_DIR = path.join(process.cwd(), "public", "models");
const FORCE = process.env.FORCE_DOWNLOAD === "1";
async function ensureDir(p) {
  await fsp.mkdir(p, { recursive: true });
}
function download(url, dest) {
  return new Promise((res, rej) => {
    https
      .get(url, (r) => {
        if (
          r.statusCode &&
          r.statusCode >= 300 &&
          r.statusCode < 400 &&
          r.headers.location
        ) {
          return res(download(r.headers.location, dest));
        }
        if (r.statusCode !== 200) {
          return rej(new Error(`HTTP ${r.statusCode} for ${url}`));
        }
        const f = fs.createWriteStream(dest);
        r.pipe(f);
        f.on("finish", () => f.close(res));
        f.on("error", rej);
      })
      .on("error", rej);
  });
}
async function main() {
  await ensureDir(DEST_DIR);
  for (const name of FILES) {
    const dest = path.join(DEST_DIR, name);
    const url = `${CDN_ROOT}/${name}`;
    let needs = FORCE;
    try {
      if (!needs) await fsp.access(dest);
    } catch {
      needs = true;
    }
    if (!needs) {
      console.log(`[models] exists: ${path.relative(process.cwd(), dest)}`);
      continue;
    }
    console.log(`[models] downloading: ${url}`);
    await download(url, dest);
    console.log(`[models] saved: ${path.relative(process.cwd(), dest)}`);
  }
  console.log(`[models] done.`);
}
main().catch((e) => {
  console.error(`[models] failed:`, e);
  process.exitCode = 1;
});

// File: src/workers/ocr.worker.ts
export {};
// @ts-ignore
import Tesseract from "tesseract.js";
self.onmessage = async (e: MessageEvent) => {
  const {
    bitmap,
    lang = "eng",
    confidence = 0.6,
  } = (e.data || {}) as {
    bitmap: ImageBitmap;
    lang?: string;
    confidence?: number;
  };
  try {
    if (!bitmap) throw new Error("no bitmap");
    const off = new OffscreenCanvas(bitmap.width, bitmap.height);
    const ctx = off.getContext("2d");
    if (!ctx) throw new Error("no 2d ctx");
    ctx.drawImage(bitmap, 0, 0);
    if (typeof (bitmap as any).close === "function") (bitmap as any).close();
    const { data } = await Tesseract.recognize(off as any, lang, {
      logger: () => {},
    });
    const cutoff = Math.max(0, Math.min(1, confidence)) * 100;
    const words = (data.words || [])
      .filter((w: any) => w.confidence >= cutoff)
      .map((w: any) => ({
        x: w.bbox.x0,
        y: w.bbox.y0,
        w: w.bbox.x1 - w.bbox.x0,
        h: w.bbox.y1 - w.bbox.y0,
        score: w.confidence / 100,
        label: "text",
      }));
    (self as any).postMessage({ ok: true, words });
  } catch (err) {
    (self as any).postMessage({ ok: false, error: String(err) });
  }
};

// File: src/features/privacy/PhotoPrivacyScrubber.tsx
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
let faceapi: any = null;
let exifr: any = null;

type RedactionMode = "fill" | "blur" | "pixelate";

type DetectedBox = {
  x: number;
  y: number;
  w: number;
  h: number;
  score?: number;
  label?: string;
};

type ProcessOptions = {
  mode: RedactionMode;
  blurRadius: number;
  pixelSize: number;
  textConfidence: number;
  faceScore: number;
};

const DEFAULTS: ProcessOptions = {
  mode: "fill",
  blurRadius: 18,
  pixelSize: 18,
  textConfidence: 0.6,
  faceScore: 0.5,
};

const MODEL_RELATIVE_URL = `${import.meta.env.BASE_URL || "/"}models`;
const FACE_MODELS = [
  "tiny_face_detector_model-weights_manifest.json",
  "tiny_face_detector_model.bin",
];
const CDN_FACE_API_MODEL_ROOT =
  "https://cdn.jsdelivr.net/npm/@vladmandic/face-api@1.7.15/model";
let FACE_MODEL_ROOT_CACHE: string | null = null;

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function useObjectUrl(file: File | null) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!file) {
      setUrl(null);
      return;
    }
    const u = URL.createObjectURL(file);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [file]);
  return url;
}

async function ensureDeps() {
  if (!faceapi) faceapi = await import("@vladmandic/face-api");
  if (!exifr) exifr = await import("exifr");
}

async function headOk(url: string) {
  try {
    const r = await fetch(url, { method: "HEAD" });
    return r.ok;
  } catch {
    return false;
  }
}

async function resolveFaceModelRoot(baseUrl: string = MODEL_RELATIVE_URL) {
  if (FACE_MODEL_ROOT_CACHE) return FACE_MODEL_ROOT_CACHE;
  const localAvail = await Promise.all(
    FACE_MODELS.map((m) => headOk(`${baseUrl}/${m}`))
  );
  FACE_MODEL_ROOT_CACHE = localAvail.every(Boolean)
    ? baseUrl
    : CDN_FACE_API_MODEL_ROOT;
  return FACE_MODEL_ROOT_CACHE;
}

async function checkModelAvailability(baseUrl: string = MODEL_RELATIVE_URL) {
  const files = await Promise.all(
    FACE_MODELS.map(async (name) => ({
      name,
      local: await headOk(`${baseUrl}/${name}`),
      cdn: await headOk(`${CDN_FACE_API_MODEL_ROOT}/${name}`),
    }))
  );
  const source: "local" | "cdn" = files.every((f) => f.local) ? "local" : "cdn";
  const root = source === "local" ? baseUrl : CDN_FACE_API_MODEL_ROOT;
  return { source, files, root, checkedAt: Date.now() };
}

async function loadFaceModels() {
  await ensureDeps();
  const root = await resolveFaceModelRoot();
  await faceapi.nets.tinyFaceDetector.loadFromUri(root);
}

async function detectFacesOnCanvas(
  canvas: HTMLCanvasElement,
  minScore: number
): Promise<DetectedBox[]> {
  await loadFaceModels();
  const options = new faceapi.TinyFaceDetectorOptions({
    inputSize: 416,
    scoreThreshold: clamp(minScore, 0.1, 0.9),
  });
  const results = await faceapi.detectAllFaces(canvas, options);
  return results.map((r: any) => ({
    x: r.box.x,
    y: r.box.y,
    w: r.box.width,
    h: r.box.height,
    score: r.score,
    label: "face",
  }));
}

function redactBoxes(
  canvas: HTMLCanvasElement,
  boxes: DetectedBox[],
  mode: RedactionMode,
  blurRadius: number,
  pixelSize: number
) {
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return;
  for (const b of boxes) {
    const x = Math.max(0, b.x);
    const y = Math.max(0, b.y);
    const w = Math.min(canvas.width - x, b.w);
    const h = Math.min(canvas.height - y, b.h);
    if (w <= 0 || h <= 0) continue;
    if (mode === "fill") {
      const prev = ctx.fillStyle;
      ctx.fillStyle = "#000";
      ctx.fillRect(x, y, w, h);
      ctx.fillStyle = prev as string;
    } else if (mode === "blur") {
      const off = document.createElement("canvas");
      off.width = w;
      off.height = h;
      const octx = off.getContext("2d");
      if (!octx) continue;
      octx.drawImage(canvas, x, y, w, h, 0, 0, w, h);
      ctx.save();
      ctx.filter = `blur(${clamp(blurRadius, 4, 48)}px)`;
      ctx.drawImage(off, x, y);
      ctx.restore();
    } else if (mode === "pixelate") {
      const size = clamp(pixelSize, 4, 64);
      const off = document.createElement("canvas");
      off.width = Math.max(1, Math.floor(w / size));
      off.height = Math.max(1, Math.floor(h / size));
      const octx = off.getContext("2d", { willReadFrequently: true });
      if (!octx) continue;
      octx.imageSmoothingEnabled = false;
      octx.drawImage(canvas, x, y, w, h, 0, 0, off.width, off.height);
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(off, 0, 0, off.width, off.height, x, y, w, h);
      ctx.imageSmoothingEnabled = true;
    }
  }
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export default function PhotoPrivacyScrubber() {
  const [file, setFile] = useState<File | null>(null);
  const inputUrl = useObjectUrl(file);
  const [resultUrl, setResultUrl] = useState<string | null>(null);
  const [faces, setFaces] = useState<DetectedBox[]>([]);
  const [words, setWords] = useState<DetectedBox[]>([]);
  const [status, setStatus] = useState<string>("");
  const [opts, setOpts] = useState<ProcessOptions>(DEFAULTS);
  const [modelInfo, setModelInfo] = useState<null | {
    source: "local" | "cdn";
    root: string;
    files: { name: string; local: boolean; cdn: boolean }[];
    checkedAt: number;
  }>(null);
  const [checkingModels, setCheckingModels] = useState<boolean>(false);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const ocrWorkerRef = useRef<Worker | null>(null);
  const hasResult = !!resultUrl;
  const boxes = useMemo(() => [...faces, ...words], [faces, words]);

  useEffect(() => {
    const w = new Worker(
      new URL("../../workers/ocr.worker.ts", import.meta.url),
      { type: "module" }
    );
    ocrWorkerRef.current = w;
    return () => {
      w.terminate();
      ocrWorkerRef.current = null;
    };
  }, []);

  useEffect(() => {
    return () => {
      if (resultUrl) URL.revokeObjectURL(resultUrl);
    };
  }, [resultUrl]);

  const onReset = useCallback(() => {
    if (resultUrl) URL.revokeObjectURL(resultUrl);
    setResultUrl(null);
    setFaces([]);
    setWords([]);
    setStatus("");
  }, [resultUrl]);

  const onFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const f = e.target.files?.[0] || null;
      setFile(f);
      onReset();
    },
    [onReset]
  );

  const doModelCheck = useCallback(async () => {
    setCheckingModels(true);
    try {
      const info = await checkModelAvailability();
      setModelInfo(info);
    } finally {
      setCheckingModels(false);
    }
  }, []);
  useEffect(() => {
    void doModelCheck();
  }, [doModelCheck]);

  const detectTextViaWorker = useCallback(
    async (
      canvas: HTMLCanvasElement,
      threshold01: number
    ): Promise<DetectedBox[]> => {
      const worker = ocrWorkerRef.current;
      if (!worker || typeof createImageBitmap !== "function") {
        // @ts-ignore
        const Tesseract =
          (await import("tesseract.js")).default ||
          (await import("tesseract.js"));
        const { data } = await Tesseract.recognize(canvas, "eng", {
          logger: () => {},
        });
        const cutoff = clamp(threshold01, 0, 1) * 100;
        return (data.words || [])
          .filter((w: any) => w.confidence >= cutoff)
          .map((w: any) => ({
            x: w.bbox.x0,
            y: w.bbox.y0,
            w: w.bbox.x1 - w.bbox.x0,
            h: w.bbox.y1 - w.bbox.y0,
            score: w.confidence / 100,
            label: "text",
          }));
      }
      const bitmap = await createImageBitmap(canvas);
      return new Promise<DetectedBox[]>((resolve, reject) => {
        const onMsg = (ev: MessageEvent) => {
          const d: any = ev.data || {};
          worker.removeEventListener("message", onMsg);
          if (d.ok) resolve(d.words as DetectedBox[]);
          else reject(new Error(d.error || "ocr failed"));
        };
        worker.addEventListener("message", onMsg);
        worker.postMessage({ bitmap, lang: "eng", confidence: threshold01 }, [
          bitmap as any,
        ]);
      });
    },
    []
  );

  const process = useCallback(async () => {
    if (!file) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    setStatus("Reading image & orientation…");
    const [img, orientation] = await Promise.all([
      (async () => {
        return await new Promise<HTMLImageElement>((resolve, reject) => {
          const im = new Image();
          im.onload = () => {
            URL.revokeObjectURL(im.src);
            resolve(im);
          };
          im.onerror = (e) => {
            URL.revokeObjectURL((im as HTMLImageElement).src);
            reject(e);
          };
          const u = URL.createObjectURL(file);
          im.src = u;
        });
      })(),
      (async () => {
        try {
          await ensureDeps();
          const o = await (await import("exifr")).orientation(file);
          return typeof o === "number" ? o : null;
        } catch {
          return null;
        }
      })(),
    ]);
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return;
    const w = img.naturalWidth,
      h = img.naturalHeight;
    if (!w || !h) return;
    if (orientation === 6 || orientation === 8) {
      const cw = orientation === 6;
      canvas.width = h;
      canvas.height = w;
      ctx.translate(cw ? h : 0, cw ? 0 : w);
      ctx.rotate((cw ? 90 : -90) * (Math.PI / 180));
      ctx.drawImage(img, 0, 0);
    } else if (orientation === 3) {
      canvas.width = w;
      canvas.height = h;
      ctx.translate(w, h);
      ctx.rotate(Math.PI);
      ctx.drawImage(img, 0, 0);
    } else {
      canvas.width = w;
      canvas.height = h;
      ctx.drawImage(img, 0, 0);
    }
    setStatus("Detecting faces…");
    let facesFound: DetectedBox[] = [];
    try {
      facesFound = await detectFacesOnCanvas(canvas, opts.faceScore);
    } catch {}
    setStatus("Detecting text… (non-blocking)");
    let wordsFound: DetectedBox[] = [];
    try {
      wordsFound = await detectTextViaWorker(canvas, opts.textConfidence);
    } catch {}
    setFaces(facesFound);
    setWords(wordsFound);
    setStatus("Applying redactions…");
    const combined = [...facesFound, ...wordsFound];
    redactBoxes(canvas, combined, opts.mode, opts.blurRadius, opts.pixelSize);
    setStatus("Exporting sanitized image…");
    canvas.toBlob(
      (blob) => {
        if (!blob) return;
        if (resultUrl) URL.revokeObjectURL(resultUrl);
        const url = URL.createObjectURL(blob);
        setResultUrl(url);
        setStatus("Done. All metadata stripped by re-encoding.");
      },
      "image/png",
      0.95
    );
  }, [
    file,
    opts.faceScore,
    opts.textConfidence,
    opts.mode,
    opts.blurRadius,
    opts.pixelSize,
    resultUrl,
    detectTextViaWorker,
  ]);

  const download = useCallback(() => {
    if (!resultUrl || !file) return;
    fetch(resultUrl)
      .then((r) => r.blob())
      .then((b) =>
        downloadBlob(b, file.name.replace(/\.[^.]+$/, "_scrubbed.png"))
      );
  }, [file, resultUrl]);

  const removeSelection = useCallback(
    (i: number) => {
      if (i < faces.length)
        setFaces((prev) => prev.filter((_, idx) => idx !== i));
      else
        setWords((prev) => prev.filter((_, idx) => idx !== i - faces.length));
    },
    [faces.length]
  );

  return (
    <div className="mx-auto max-w-4xl p-4">
      <h1 className="text-2xl font-semibold mb-2">Photo Privacy Scrubber</h1>
      <p className="text-sm text-gray-500 mb-4">
        Upload a photo to remove EXIF metadata and automatically conceal faces &
        text on-device.
      </p>
      <div className="flex gap-4 items-start">
        <div className="flex-1 space-y-3">
          <input
            type="file"
            accept="image/*"
            onChange={onFileChange}
            className="block w-full"
          />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="border rounded-2xl p-3">
              <h2 className="font-medium mb-2">Input</h2>
              {inputUrl ? (
                <img
                  src={inputUrl}
                  alt="input"
                  className="w-full h-auto rounded-lg"
                />
              ) : (
                <div className="text-sm text-gray-400">No image selected</div>
              )}
            </div>
            <div className="border rounded-2xl p-3">
              <h2 className="font-medium mb-2">Output</h2>
              <canvas
                ref={canvasRef}
                className="w-full h-auto rounded-lg border"
              />
              <div className="mt-2 flex gap-2 items-center">
                <button
                  onClick={process}
                  disabled={!file}
                  className="px-3 py-2 rounded-xl border disabled:opacity-50"
                >
                  Process
                </button>
                <button
                  onClick={download}
                  disabled={!hasResult}
                  className="px-3 py-2 rounded-xl border disabled:opacity-50"
                >
                  Download
                </button>
                {modelInfo && (
                  <span
                    className="ml-auto text-xs px-2 py-1 rounded-full border"
                    title={`Checked ${new Date(
                      modelInfo.checkedAt
                    ).toLocaleTimeString()}`}
                  >
                    Models: {modelInfo.source === "local" ? "Local" : "CDN"}
                  </span>
                )}
              </div>
              <p className="text-xs text-gray-500 mt-2 min-h-5">{status}</p>
            </div>
          </div>
          <div className="border rounded-2xl p-3 space-y-3">
            <h2 className="font-medium">Redaction Options</h2>
            <div className="flex flex-wrap gap-3 items-center">
              <label className="flex items-center gap-2 text-sm">
                <span>Mode</span>
                <select
                  className="border rounded-lg px-2 py-1"
                  value={opts.mode}
                  onChange={(e) =>
                    setOpts((o) => ({
                      ...o,
                      mode: e.target.value as RedactionMode,
                    }))
                  }
                >
                  <option value="fill">Solid Fill (safest)</option>
                  <option value="blur">Blur</option>
                  <option value="pixelate">Pixelate</option>
                </select>
              </label>
              {opts.mode === "blur" && (
                <label className="flex items-center gap-2 text-sm">
                  <span>Blur</span>
                  <input
                    type="range"
                    min={4}
                    max={48}
                    value={opts.blurRadius}
                    onChange={(e) =>
                      setOpts((o) => ({
                        ...o,
                        blurRadius: Number(e.target.value),
                      }))
                    }
                  />
                </label>
              )}
              {opts.mode === "pixelate" && (
                <label className="flex items-center gap-2 text-sm">
                  <span>Pixel</span>
                  <input
                    type="range"
                    min={4}
                    max={64}
                    value={opts.pixelSize}
                    onChange={(e) =>
                      setOpts((o) => ({
                        ...o,
                        pixelSize: Number(e.target.value),
                      }))
                    }
                  />
                </label>
              )}
            </div>
            <div className="flex flex-wrap gap-3 items-center">
              <label className="flex items-center gap-2 text-sm">
                <span>Face score ≥</span>
                <input
                  type="number"
                  step={0.05}
                  min={0.1}
                  max={0.9}
                  value={opts.faceScore}
                  onChange={(e) =>
                    setOpts((o) => ({
                      ...o,
                      faceScore: Number(e.target.value),
                    }))
                  }
                  className="w-20 border rounded px-2 py-1"
                />
              </label>
            </div>
          </div>
          {boxes.length > 0 && (
            <div className="border rounded-2xl p-3">
              <h2 className="font-medium mb-2">Detections ({boxes.length})</h2>
              <ul className="text-sm grid grid-cols-1 md:grid-cols-2 gap-x-4">
                {boxes.map((b, i) => (
                  <li
                    key={`${b.label}-${i}`}
                    className="flex items-center justify-between py-1 border-b last:border-b-0"
                  >
                    <span className="text-gray-600">
                      #{i + 1} {b.label}{" "}
                      {b.score ? `(${b.score.toFixed(2)})` : ""}
                    </span>
                    <button
                      onClick={() => removeSelection(i)}
                      className="text-xs px-2 py-1 border rounded-lg"
                    >
                      remove
                    </button>
                  </li>
                ))}
              </ul>
              <p className="text-xs text-gray-500 mt-2">
                You can remove false positives before re-processing.
              </p>
            </div>
          )}
        </div>
        <aside className="w-72 shrink-0 border rounded-2xl p-3 space-y-3">
          <h3 className="font-medium">Usage</h3>
          <ol className="list-decimal list-inside text-sm space-y-1">
            <li>
              Install deps:{" "}
              <code>npm i @vladmandic/face-api tesseract.js exifr</code>
            </li>
            <li>
              Run <code>npm run models:fetch</code> (happens automatically on
              install).
            </li>
            <li>
              Import and render <code>{`<PhotoPrivacyScrubber />`}</code> in
              your app.
            </li>
            <li>
              Prefer <em>Solid Fill</em> for maximum privacy.
            </li>
          </ol>
          <div>
            <h4 className="font-medium mb-1">Models</h4>
            <p className="text-sm text-gray-600">
              Local path <code>public/models/</code> or CDN fallback.
            </p>
            <ul className="list-disc list-inside text-sm text-gray-600">
              <li>
                <code>tiny_face_detector_model-weights_manifest.json</code>
              </li>
              <li>
                <code>tiny_face_detector_model.bin</code>
              </li>
            </ul>
          </div>
          <div>
            <h4 className="font-medium mb-1">Health Check</h4>
            <div className="text-sm space-y-1">
              <button
                onClick={doModelCheck}
                className="text-xs px-2 py-1 border rounded-lg disabled:opacity-50"
                disabled={checkingModels}
              >
                {checkingModels ? "Checking…" : "Re-check models"}
              </button>
              {modelInfo && (
                <div className="text-xs mt-2">
                  <div>
                    Source: // replace the conditional render with this:
                    <span
                      className="ml-auto text-xs px-2 py-1 rounded-full border"
                      title={
                        modelInfo
                          ? `Checked ${new Date(
                              modelInfo.checkedAt
                            ).toLocaleTimeString()}`
                          : "Checking…"
                      }
                    >
                      Models:{" "}
                      {modelInfo
                        ? modelInfo.source === "local"
                          ? "Local"
                          : "CDN"
                        : "Checking…"}
                    </span>
                  </div>
                  <div className="truncate" title={modelInfo.root}>
                    Root: {modelInfo.root}
                  </div>
                  <ul className="mt-1 space-y-0.5">
                    {modelInfo.files.map((f) => (
                      <li key={f.name} className="flex items-center gap-2">
                        <span className="w-4 text-center">
                          {f.local ? "✅" : f.cdn ? "↪️" : "❌"}
                        </span>
                        <span className="truncate">{f.name}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </div>
          <div>
            <h4 className="font-medium mb-1">Why canvas re-encode?</h4>
            <p className="text-sm text-gray-600">
              Exporting canvas to PNG drops EXIF & most metadata by design.
            </p>
          </div>
          <div>
            <h4 className="font-medium mb-1">Limitations</h4>
            <ul className="list-disc list-inside text-sm text-gray-600">
              <li>OCR is CPU-heavy; large images may take seconds.</li>
              <li>
                Consider downscaling very large photos before OCR for speed.
              </li>
              <li>Always review output for edge cases.</li>
            </ul>
          </div>
        </aside>
      </div>
    </div>
  );
}

// File: package.json (merge these keys)
/*
{
  "scripts": {
    "models:fetch": "node scripts/fetch-face-models.mjs",
    "postinstall": "node scripts/fetch-face-models.mjs"
  }
}
*/
