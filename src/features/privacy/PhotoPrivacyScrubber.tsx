// File: src/features/privacy/PhotoPrivacyScrubber.tsx
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

type FaceAPINamespace = typeof import("@vladmandic/face-api");
type ExifrNamespace = typeof import("exifr");

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
  ocrMaxDim: number;
};

const DEFAULTS: ProcessOptions = {
  mode: "fill",
  blurRadius: 18,
  pixelSize: 18,
  textConfidence: 0.6,
  faceScore: 0.5,
  ocrMaxDim: 1600,
};

const MODEL_RELATIVE_URL = `${import.meta.env.BASE_URL || "/"}models`;
const FACE_MODELS = [
  "tiny_face_detector_model-weights_manifest.json",
  "tiny_face_detector_model.bin",
];
const CDN_FACE_API_MODEL_ROOT =
  "https://cdn.jsdelivr.net/npm/@vladmandic/face-api@1.7.15/model";
let FACE_MODEL_ROOT_CACHE: string | null = null;

let faceapiNS: FaceAPINamespace | null = null;
let exifrNS: ExifrNamespace | null = null;

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

async function ensureFace(): Promise<FaceAPINamespace> {
  if (!faceapiNS)
    faceapiNS = (await import("@vladmandic/face-api")) as FaceAPINamespace;
  return faceapiNS;
}
async function ensureExifr(): Promise<ExifrNamespace> {
  if (!exifrNS) exifrNS = (await import("exifr")) as ExifrNamespace;
  return exifrNS;
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
  const faceapi = await ensureFace();
  const root = await resolveFaceModelRoot();
  await faceapi.nets.tinyFaceDetector.loadFromUri(root);
}

async function detectFacesOnCanvas(
  canvas: HTMLCanvasElement,
  minScore: number
): Promise<DetectedBox[]> {
  await loadFaceModels();
  const faceapi = await ensureFace();
  const options = new faceapi.TinyFaceDetectorOptions({
    inputSize: 416,
    scoreThreshold: clamp(minScore, 0.1, 0.9),
  });
  const results = (await faceapi.detectAllFaces(canvas, options)) as Array<{
    box: { x: number; y: number; width: number; height: number };
    score: number;
  }>;
  return results.map((r) => ({
    x: r.box.x,
    y: r.box.y,
    w: r.box.width,
    h: r.box.height,
    score: r.score,
    label: "face",
  }));
}

function scaledCanvas(
  src: HTMLCanvasElement,
  maxDim: number
): HTMLCanvasElement {
  const w = src.width;
  const h = src.height;
  const max = Math.max(w, h);
  if (!maxDim || maxDim <= 0 || max <= maxDim) return src;
  const ratio = maxDim / max;
  const out = document.createElement("canvas");
  out.width = Math.max(1, Math.round(w * ratio));
  out.height = Math.max(1, Math.round(h * ratio));
  const ctx = out.getContext("2d", { willReadFrequently: true });
  if (!ctx) return src;
  ctx.drawImage(src, 0, 0, out.width, out.height);
  return out;
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
    const x = Math.max(0, Math.floor(b.x));
    const y = Math.max(0, Math.floor(b.y));
    const w = Math.min(canvas.width - x, Math.floor(b.w));
    const h = Math.min(canvas.height - y, Math.floor(b.h));
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
    try {
      const w = new Worker(
        new URL("../../workers/ocr.worker.ts", import.meta.url),
        { type: "module" }
      );
      ocrWorkerRef.current = w;
      return () => {
        w.terminate();
        ocrWorkerRef.current = null;
      };
    } catch {
      ocrWorkerRef.current = null;
    }
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
      threshold01: number,
      ocrMaxDim: number
    ): Promise<DetectedBox[]> => {
      const worker = ocrWorkerRef.current;
      const src = scaledCanvas(canvas, Math.floor(ocrMaxDim || 0));
      if (!worker || typeof createImageBitmap !== "function") {
        type OCRWord = {
          confidence: number;
          bbox: { x0: number; y0: number; x1: number; y1: number };
        };
        type RecognizeData = { words?: OCRWord[] };
        type RecognizeResult = { data: RecognizeData };
        const { default: Tesseract } = (await import("tesseract.js")) as {
          default: {
            recognize: (
              img: any,
              lang: string,
              opts?: { logger?: (m: unknown) => void }
            ) => Promise<RecognizeResult>;
          };
        };
        const { data } = await Tesseract.recognize(src, "eng", {
          logger: () => {},
        });
        const cutoff = clamp(threshold01, 0, 1) * 100;
        return (data.words || [])
          .filter((w) => w.confidence >= cutoff)
          .map((w) => ({
            x: w.bbox.x0,
            y: w.bbox.y0,
            w: w.bbox.x1 - w.bbox.x0,
            h: w.bbox.y1 - w.bbox.y0,
            score: w.confidence / 100,
            label: "text",
          }));
      }
      const bitmap = await createImageBitmap(src);
      return new Promise<DetectedBox[]>((resolve, reject) => {
        const onMsg = (ev: MessageEvent) => {
          const d: unknown = ev.data;
          (worker as Worker).removeEventListener("message", onMsg);
          const payload = d as {
            ok?: boolean;
            words?: DetectedBox[];
            error?: string;
          };
          if (payload && payload.ok) resolve(payload.words || []);
          else reject(new Error((payload && payload.error) || "ocr failed"));
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
          const exifr = await ensureExifr();
          const o = await (exifr as any).orientation(file);
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
    } catch {
      console.log("Detect Faces on Canvas failed!");
    }
    setStatus("Detecting text… (non-blocking)");
    let wordsFound: DetectedBox[] = [];
    try {
      wordsFound = await detectTextViaWorker(
        canvas,
        opts.textConfidence,
        opts.ocrMaxDim
      );
    } catch {
      console.log("detectTextViaWorker failed!");
    }
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
    opts.ocrMaxDim,
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
              <label className="flex items-center gap-2 text-sm">
                <span>OCR max size</span>
                <input
                  type="number"
                  min={0}
                  max={4000}
                  value={opts.ocrMaxDim}
                  onChange={(e) =>
                    setOpts((o) => ({
                      ...o,
                      ocrMaxDim: Math.max(0, Number(e.target.value)),
                    }))
                  }
                  className="w-24 border rounded px-2 py-1"
                />
                <span className="text-xs text-gray-500">px (0=off)</span>
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
                    Source:{" "}
                    <span className="font-medium">
                      {modelInfo.source === "local" ? "Local" : "CDN"}
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
