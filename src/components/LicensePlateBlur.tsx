import React, { useCallback, useEffect, useRef, useState } from "react";
import { Button, Card, Form, Spinner, Stack } from "react-bootstrap";

import type { Tensor } from "onnxruntime-web"; // type-only
import { ort, createOrtSession, ortForceBasicWasm } from "../ort-setup";

import "./LicensePlateBlur.css"; // your overrides

/**
 * LicensePlateBlur — loads an ONNX model (once), detects plates on image load,
 * and blurs the detected regions on a canvas.
 *
 * Why certain choices:
 * - `onLoad` on <img>: guarantees refs are set when detection runs.
 * - `sessionReady` flag: prevents running detection before model init.
 * - StrictMode guard (didInitRef): avoids double model init in React dev.
 */

/* ============================== Utilities ============================== */
function invariant(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

function assertDims1xNxM(
  dims: unknown
): asserts dims is readonly [1, number, number] {
  invariant(Array.isArray(dims), "Tensor dims missing");
  invariant(dims.length === 3, `Unexpected dims length: ${dims.length}`);
  invariant(dims[0] === 1, `Batch dimension must be 1, got ${dims[0]}`);
}

function getFloat32Data(t: Tensor): Float32Array {
  const data = (t as unknown as { data: unknown }).data;
  if (!(data instanceof Float32Array)) {
    const kind = Object.prototype.toString.call(data);
    throw new Error(`Tensor data is not Float32Array (got ${kind})`);
  }
  return data;
}

/* ================================ Types ================================ */
export type LicensePlateBlurProps = {
  initialImageUrl?: string | null;
  modelSize?: number;
  confThresh?: number;
  iouThresh?: number;
  blurRadius?: number;
  padRatio?: number;
  modelUrl?: string;
};

type Box = { x: number; y: number; w: number; h: number; conf: number };
type Size = { w: number; h: number };

/* ================================ Math ================================= */
function letterbox(
  src: HTMLImageElement,
  dstSize: number
): { input: Float32Array; scale: number; pad: { x: number; y: number } } {
  const S = Math.round(dstSize);
  const iw = src.naturalWidth;
  const ih = src.naturalHeight;
  const r = Math.min(S / iw, S / ih);
  const nw = Math.round(iw * r);
  const nh = Math.round(ih * r);
  const dx = Math.floor((S - nw) / 2);
  const dy = Math.floor((S - nh) / 2);

  const off = document.createElement("canvas");
  off.width = S;
  off.height = S;
  const octx = off.getContext("2d");
  if (!octx) throw new Error("2D context unavailable");

  octx.fillStyle = "black";
  octx.fillRect(0, 0, S, S);
  octx.drawImage(src, 0, 0, iw, ih, dx, dy, nw, nh);

  const { data } = octx.getImageData(0, 0, S, S);
  const plane = S * S;
  const input = new Float32Array(3 * plane);

  for (let px = 0, i = 0; px < plane; px++, i += 4) {
    const r8 = data[i] ?? 0;
    const g8 = data[i + 1] ?? 0;
    const b8 = data[i + 2] ?? 0;
    input[px] = r8 / 255;
    input[plane + px] = g8 / 255;
    input[2 * plane + px] = b8 / 255;
  }

  return { input, scale: r, pad: { x: dx, y: dy } };
}

function iou(a: Box, b: Box): number {
  const ax2 = a.x + a.w;
  const ay2 = a.y + a.h;
  const bx2 = b.x + b.w;
  const by2 = b.y + b.h;
  const x1 = Math.max(a.x, b.x);
  const y1 = Math.max(a.y, b.y);
  const x2 = Math.min(ax2, bx2);
  const y2 = Math.min(ay2, by2);
  const w = Math.max(0, x2 - x1);
  const h = Math.max(0, y2 - y1);
  const inter = w * h;
  const ua = a.w * a.h + b.w * b.h - inter;
  return ua > 0 ? inter / ua : 0;
}

function nms(boxes: Box[], threshold: number): Box[] {
  const sorted = [...boxes].sort((a, b) => b.conf - a.conf);
  const kept: Box[] = [];
  for (const box of sorted) {
    let drop = false;
    for (const k of kept) {
      if (iou(box, k) > threshold) {
        drop = true;
        break;
      }
    }
    if (!drop) kept.push(box);
  }
  return kept;
}

function toRows(out: Tensor): { rows: Float32Array; N: number; M: number } {
  const dimsAny = (out as unknown as { dims: unknown }).dims;
  if (!Array.isArray(dimsAny)) throw new Error("Tensor dims missing");
  const dims = dimsAny as number[];
  assertDims1xNxM(dims);
  const [, d1, d2] = dims;
  const data = getFloat32Data(out);

  const aN = d1,
    aM = d2;
  const bN = d2,
    bM = d1;

  if (bM >= 5 && (aM < 5 || bM <= aM)) {
    const N = bN,
      M = bM;
    const rows = new Float32Array(N * M);
    for (let m = 0; m < M; m++) {
      for (let n = 0; n < N; n++) rows[n * M + m] = data[m * N + n] ?? 0;
    }
    return { rows, N, M };
  }
  const N = aN,
    M = aM;
  return { rows: data, N, M };
}

function parseYOLO(out: Tensor, imgSize: number, confThreshold: number): Box[] {
  const { rows, N, M } = toRows(out);
  const boxes: Box[] = [];
  for (let i = 0; i < N; i++) {
    const off = i * M;
    const cx = rows[off + 0];
    const cy = rows[off + 1];
    const w = rows[off + 2];
    const h = rows[off + 3];
    const conf = rows[off + 4];

    if (
      [cx, cy, w, h, conf].some((v) => v === undefined || !Number.isFinite(v))
    )
      continue;

    // All values are defined and finite at this point
    const cxVal = cx as number;
    const cyVal = cy as number;
    const wVal = w as number;
    const hVal = h as number;
    let confVal = conf as number;

    if (M > 5) {
      let best = 0;
      for (let j = 5; j < M; j++) best = Math.max(best, rows[off + j] ?? 0);
      confVal *= best;
    }
    if (!Number.isFinite(confVal) || confVal < confThreshold) continue;

    const x = Math.max(0, Math.min(imgSize - 1, cxVal - wVal / 2));
    const y = Math.max(0, Math.min(imgSize - 1, cyVal - hVal / 2));
    const wC = Math.max(1, Math.min(imgSize - x, wVal));
    const hC = Math.max(1, Math.min(imgSize - y, hVal));
    boxes.push({ x, y, w: wC, h: hC, conf: confVal });
  }
  return boxes;
}

function toOriginalSpace(
  b: Box,
  src: Size,
  scale: number,
  pad: { x: number; y: number },
  padPct: number
): Box {
  const x = (b.x - pad.x) / scale;
  const y = (b.y - pad.y) / scale;
  const w = b.w / scale;
  const h = b.h / scale;

  const px = Math.round(w * padPct);
  const py = Math.round(h * padPct);
  const x2 = Math.max(0, Math.min(src.w - 1, x - px));
  const y2 = Math.max(0, Math.min(src.h - 1, y - py));
  const w2 = Math.max(1, Math.min(src.w - x2, w + px * 2));
  const h2 = Math.max(1, Math.min(src.h - y2, h + py * 2));
  return { x: x2, y: y2, w: w2, h: h2, conf: b.conf };
}

function blurRegion(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  r: Box,
  radius: number
): void {
  if (r.w <= 0 || r.h <= 0) return;
  const off = document.createElement("canvas");
  off.width = Math.max(1, Math.round(r.w));
  off.height = Math.max(1, Math.round(r.h));
  const octx = off.getContext("2d");
  if (!octx) return;
  octx.filter = `blur(${radius}px)`; // why: strong privacy blur in region
  octx.drawImage(
    img,
    Math.round(r.x),
    Math.round(r.y),
    Math.round(r.w),
    Math.round(r.h),
    0,
    0,
    off.width,
    off.height
  );
  const x = Math.round(r.x),
    y = Math.round(r.y);
  ctx.drawImage(off, x, y);
}

/* ============================== Component =============================== */
const LicensePlateBlur: React.FC<LicensePlateBlurProps> = ({
  modelSize = 640,
  confThresh = 0.35,
  iouThresh = 0.45,
  blurRadius = 14,
  padRatio = 0.2,
  modelUrl = "/models/license-plate-finetune-v1n.onnx",
  initialImageUrl = null,
}) => {
  const [imageUrl, setImageUrl] = useState<string | null>(initialImageUrl);
  const [status, setStatus] = useState<string>("Model not loaded");
  const [busy, setBusy] = useState<boolean>(false);
  const [sessionReady, setSessionReady] = useState<boolean>(false);
  const [imageReady, setImageReady] = useState<boolean>(false);
  const processedUrlRef = useRef<string | null>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const sessionRef = useRef<ort.InferenceSession | null>(null);

  const onPickFile = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>): void => {
      const files = e.currentTarget.files;
      if (!files || files.length === 0) {
        setImageUrl(null);
        return;
      }
      const file = files[0]!;
      const url = URL.createObjectURL(file);
      setImageUrl((prev) => {
        if (prev?.startsWith("blob:")) URL.revokeObjectURL(prev);
        return url;
      });
    },
    []
  );

  const drawOriginal = useCallback((): void => {
    const img = imgRef.current;
    const cvs = canvasRef.current;
    if (!img || !cvs) return;
    cvs.width = img.naturalWidth;
    cvs.height = img.naturalHeight;
    const ctx = cvs.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, cvs.width, cvs.height);
    ctx.drawImage(img, 0, 0);
  }, []);

  // Load model once
  useEffect(() => {
    const ac = new AbortController();
    let alive = true;

    (async () => {
      try {
        setStatus("Loading model…");
        ortForceBasicWasm();

        const resp = await fetch(modelUrl, {
          cache: "no-store",
          signal: ac.signal,
        });
        if (!resp.ok) throw new Error(`Model HTTP ${resp.status}`);
        const buf = await resp.arrayBuffer();

        if (!alive) return; // effect cleaned up while fetching
        const size = buf.byteLength;
        const head = new TextDecoder().decode(
          new Uint8Array(buf, 0, Math.min(64, size))
        );
        if (
          size < 1024 ||
          head.startsWith("<!DOCTYPE") ||
          head.startsWith("<html")
        ) {
          throw new Error(
            `Invalid model payload (${size} bytes) — check /public/models path.`
          );
        }

        const sess = await createOrtSession(buf);
        if (!alive) return; // effect cleaned up while creating session
        sessionRef.current = sess;
        setSessionReady(true);
        setStatus("Model ready. Pick an image.");
      } catch (e) {
        if (e instanceof DOMException && e.name === "AbortError") return; // fetch aborted
        setStatus(
          `Failed to load model: ${e instanceof Error ? e.message : String(e)}`
        );
      }
    })();

    return () => {
      alive = false; // prevents post-await work
      ac.abort(); // cancel in-flight fetch
    };
  }, [modelUrl]);

  const detectAndBlur = useCallback(async (): Promise<void> => {
    const img = imgRef.current;
    const cvs = canvasRef.current;
    const session = sessionRef.current;

    if (!session) {
      setStatus("Model not ready yet");
      return;
    }
    if (!img) {
      setStatus("Image not ready yet");
      return;
    }
    if (!cvs) {
      setStatus("Canvas not ready");
      return;
    }

    setBusy(true);
    setStatus("Detecting plates…");
    drawOriginal();

    try {
      const { input, scale, pad } = letterbox(img, modelSize);
      invariant(session.inputNames.length > 0, "No model inputs");
      invariant(session.outputNames.length > 0, "No model outputs");

      const inputName = session.inputNames[0] as string;
      const tensor = new ort.Tensor("float32", input, [
        1,
        3,
        modelSize,
        modelSize,
      ]);
      const outputs = await session.run({ [inputName]: tensor });

      const outName = session.outputNames[0];
      invariant(outName !== undefined, "Output name is undefined");
      const firstOut = outputs[outName] as unknown as Tensor;

      const raw = parseYOLO(firstOut, modelSize, confThresh);
      const kept = nms(raw, iouThresh);

      const src: Size = { w: img.naturalWidth, h: img.naturalHeight };
      const mapped = kept.map((b) =>
        toOriginalSpace(b, src, scale, pad, padRatio)
      );

      const ctx = cvs.getContext("2d");
      if (!ctx) return;
      for (const r of mapped) blurRegion(ctx, img, r, blurRadius);

      setStatus(
        mapped.length
          ? `Blurred ${mapped.length} plate${mapped.length > 1 ? "s" : ""} ✔️`
          : "No plates detected (try a closer, clearer photo)."
      );
    } catch (e) {
      setStatus(
        `Detection failed: ${e instanceof Error ? e.message : String(e)}`
      );
    } finally {
      setBusy(false);
    }
  }, [blurRadius, confThresh, drawOriginal, iouThresh, modelSize, padRatio]);

  // inside your component
  const handleDownload = useCallback(() => {
    const cvs = canvasRef.current;
    if (!cvs) return;
    // Re-encode from canvas → new file, no EXIF metadata.
    cvs.toBlob(
      (blob) => {
        if (!blob) return;
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = "redacted.jpg"; // or .png
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 0);
      },
      "image/jpeg", // PNG also strips EXIF; use "image/png" if you prefer lossless
      0.92
    );
  }, []);

  const handleImgLoad = useCallback((): void => {
    setImageReady(true);
  }, []);

  // If the image is already decoded when assigned, mark it ready
  useEffect(() => {
    const img = imgRef.current;
    if (imageUrl && img && img.complete) setImageReady(true);
  }, [imageUrl]);

  // Run detection once when BOTH model and image are ready
  useEffect(() => {
    const img = imgRef.current;
    if (!sessionReady || !imageReady || !imageUrl || !img) return;
    if (processedUrlRef.current === imageUrl) return; // avoid repeats
    processedUrlRef.current = imageUrl;
    drawOriginal();
    void detectAndBlur();
  }, [sessionReady, imageReady, imageUrl, detectAndBlur, drawOriginal]);

  // Reset per-image flags on image change
  useEffect(() => {
    processedUrlRef.current = null;
    setImageReady(false);
  }, [imageUrl]);

  // revoke blob URLs on unmount or when replaced
  useEffect(
    () => () => {
      if (imageUrl?.startsWith("blob:")) URL.revokeObjectURL(imageUrl);
    },
    [imageUrl]
  );

  return (
    <>
      <Card className="shadow-sm border-0">
        <Card.Body>
          <Form>
            <div>
              <div
                className="state-banner d-flex align-items-center gap-2"
                style={{ marginBottom: "20px" }}
              >
                <div
                  className={`sm state-light ${
                    sessionReady ? "is-success" : "is-busy"
                  }`}
                ></div>
                <span> {sessionReady ? "Ready" : status}</span>
              </div>
              {imageUrl && (
                <img
                  ref={imgRef}
                  alt="image-topic"
                  src={imageUrl || undefined}
                  onLoad={handleImgLoad}
                  style={{ display: "none" }}
                />
              )}
            </div>
            {busy && (
              <Spinner
                animation="border"
                size="sm"
                role="status"
                aria-label="processing"
              />
            )}
            <Form.Group controlId="fileInput" className="mb-3">
              <Form.Control
                type="file"
                accept="image/*"
                onChange={onPickFile}
                disabled={busy}
              />
            </Form.Group>
          </Form>
          {imageUrl && (
            <>
              <div className="mb-3">
                <canvas
                  ref={canvasRef}
                  className="w-100 border rounded-3"
                  style={{ height: "auto" }}
                />
              </div>
              <Stack direction="horizontal" gap={2}>
                <Button
                  onClick={() => void detectAndBlur()}
                  disabled={!imageUrl || !sessionReady || busy}
                >
                  Re-run detection
                </Button>
                <Button
                  variant="success"
                  onClick={handleDownload}
                  disabled={!imageUrl || !sessionReady || busy}
                >
                  Download redacted
                </Button>
              </Stack>
            </>
          )}
        </Card.Body>
      </Card>
    </>
  );
};

export default LicensePlateBlur;
export { LicensePlateBlur };
