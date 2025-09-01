import React, {
  forwardRef,
  useImperativeHandle,
  useCallback,
  useRef,
  useState,
} from "react";
import { ort, createOrtSession, ortForceBasicWasm } from "../ort-setup";
import {
  letterbox,
  nms,
  blurRegion,
  drawBox,
  firstValue,
  parseYolo,
  get2D,
  blurPatchWithMargin,
} from "./utils/license-plate-blur-utils";
import { Box } from "@/types/detector-types";
import { Tensor } from "onnxruntime-web";
import Card from "react-bootstrap/esm/Card";

let plateSession: ort.InferenceSession | null = null;
let plateInputName = "";
let boxes: Box[] = [];

type WithConf = { conf?: number | string | null };

export function filterByMinConf<T extends WithConf>(arr: T[], min: number): T[] {
  return arr.filter(item => {
    const n =
      typeof item.conf === "number"
        ? item.conf
        : typeof item.conf === "string"
        ? parseFloat(item.conf)
        : NaN;
    return Number.isFinite(n) && n! >= min;
  });
}

interface LicensePlateBlurProps {
  imgRef: React.RefObject<HTMLImageElement | null>;
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  opts: {
    modelSize: number;
    confThresh: number;
    iouThresh: number;
    blurStrength: number; // interpreted as strength 0–100
    padRatio: number; // usually 0.0 or 0.1
    setPerfReport: React.Dispatch<React.SetStateAction<PerformanceReport>>;
    modelUrl: string;
    debugMode: boolean;
  };
}

async function ensurePlateSession(
  modelUrl: string
): Promise<{ plateSession: ort.InferenceSession; plateInputName: string }> {
  if (plateSession) return { plateSession, plateInputName };
  ortForceBasicWasm();
  const resp = await fetch(modelUrl, { cache: "no-store" });
  if (!resp.ok) throw new Error(`Model HTTP ${resp.status}`);
  const buf = await resp.arrayBuffer();
  const sess = await createOrtSession(buf);
  plateSession = sess;
  plateInputName = sess.inputNames?.[0] ?? "images";
  return { plateSession, plateInputName };
}

export const LicensePlateBlur = forwardRef<BlurHandler, LicensePlateBlurProps>(
  ({ imgRef, canvasRef, opts }, ref) => {
    const runningRef = useRef(false);

    const applyBluring = useCallback(async () => {
      const img = imgRef.current;
      const canvas = canvasRef.current;

      if (!img || !canvas) return;

      // canvas.width = img.naturalWidth;
      // canvas.height = img.naturalHeight;

      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      // ctx?.drawImage(img, 0, 0);
      
      ctx.clearRect(0, 0, canvas.width, canvas.height);
            
      const filtered = filterByMinConf(boxes, opts.confThresh);

      for (const b of filtered) {
        const sx = Math.max(0, Math.floor(b.x));
        const sy = Math.max(0, Math.floor(b.y));
        const sw = Math.min(canvas.width - sx, Math.ceil(b.w));
        const sh = Math.min(canvas.height - sy, Math.ceil(b.h));
        if (sw > 0 && sh > 0) {
          if (opts.debugMode) drawBox(ctx, { x: sx, y: sy, w: sw, h: sh });
          blurPatchWithMargin(ctx, img, sx, sy, sw, sh, opts.blurStrength);
        }
      }
    }, [canvasRef, imgRef, opts.blurStrength, opts.confThresh, opts.debugMode]);

    const run = useCallback(async () => {
      if (runningRef.current) return;
      runningRef.current = true;

      resetPerfMetrics();

      try {
        const img = imgRef.current;
        const canvas = canvasRef.current;

        if (!img || !canvas || !opts.modelUrl) return;

        const { plateSession, plateInputName } = await ensurePlateSession(
          opts.modelUrl
        );

        const { input, scale, pad } = letterbox(img, opts.modelSize);
        const tensor = new ort.Tensor("float32", input, [
          1,
          3,
          opts.modelSize,
          opts.modelSize,
        ]);

        const feeds: Record<string, Tensor> = {
          [plateInputName]: tensor as unknown as Tensor,
        };

        // const t1 = performance.now();
        const out = await plateSession.run(feeds);
        // const t2 = performance.now();
        const first = firstValue(out) as Tensor;
        const { data, dims } = get2D(first);
        const conf = opts.confThresh;
        const padRatio = opts.padRatio;
        const raw = parseYolo(data, dims, {
          conf,
          pad,
          scale,
          padRatio,
          max: 30000,
        });
        const pre = filterByMinConf(raw, opts.confThresh);
      
        boxes = nms(pre, opts.iouThresh);
        applyBluring();

        // const t3 = performance.now();
        // setPerfs({
        //    preprocess: t1 - t0,
        //    run: t2 - t1,
        //    post: t3 - t2,
        //    total: t3 - t0,
        // });
        console.log(`Detected ${boxes.length} plates.`);
      } catch (e) {
        runningRef.current = false;
        console.log("Error inside of LicensePlateBlur: ", e);
      } finally {
        runningRef.current = false;
      }
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [imgRef, canvasRef, opts.modelUrl, opts.modelSize, opts.confThresh, opts.iouThresh, opts.padRatio]);

    const redraw = useCallback(async () => {
      applyBluring();
    }, [applyBluring, opts.iouThresh, opts.confThresh, opts.blurStrength, opts.debugMode]);

    useImperativeHandle(
    ref,
  () => ({
    run,
    redraw,
    getDetections: () => boxes.slice(),   // <-- add this
  }),
  [run, redraw]
);

    const [perfPlates, setPerfPlates] = useState<DetectTimings>({
      preprocess: 0,
      run: 0,
      post: 0,
      total: 0,
    });

    const [perfFaces, setPerfFaces] = useState<DetectTimings>({
      preprocess: 0,
      run: 0,
      post: 0,
      total: 0,
    });

    function resetPerfMetrics() {
      setPerfPlates({
        preprocess: 0,
        run: 0,
        post: 0,
        total: 0,
      });

      setPerfFaces({
        preprocess: 0,
        run: 0,
        post: 0,
        total: 0,
      });
    }

    return (
      <Card.Footer className="d-flex flex-column gap-1 small text-secondary">
        <div className="d-flex justify-content-between">
          <span>
            <p>
              "Detections: plates detections.plates · faces detections.faces"
            </p>
          </span>
        </div>
        <div className="d-flex flex-wrap gap-3">
          {perfPlates && (
            <div>
              Plates ⏱ pre {perfPlates.preprocess.toFixed(1)}ms · run{" "}
              {perfPlates.run.toFixed(1)}ms · post {perfPlates.post.toFixed(1)}
              ms · total {perfPlates.total.toFixed(1)}ms
            </div>
          )}
          {perfFaces && (
            <span>
              Faces ⏱ pre {perfFaces.preprocess.toFixed(1)}ms · run{" "}
              {perfFaces.run.toFixed(1)}ms · post {perfFaces.post.toFixed(1)}
              ms · total {perfFaces.total.toFixed(1)}ms
            </span>
          )}
        </div>
      </Card.Footer>
    );
  }
);
