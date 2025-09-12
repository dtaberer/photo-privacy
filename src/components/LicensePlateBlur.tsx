import React, {
  forwardRef,
  useImperativeHandle,
  useCallback,
  useRef,
} from "react";
import { ort, createOrtSession, ortForceBasicWasm } from "../ort-setup";
import {
  letterbox,
  nms,
  firstValue,
  parseYolo,
  get2D,
  blurPatchWithFeather,
  filterByMinConf,
} from "./utils/license-plate-blur-utils";
import type {
  Box,
  PerformanceReport,
  BlurHandler,
} from "@/types/detector-types";
import type { Tensor } from "onnxruntime-web";
import { LicensePlateBlurConstants } from "./constants";

let plateSession: ort.InferenceSession | null = null;
let plateInputName = "";

export type BoxWithConf = Box & { conf: number };
let boxes: BoxWithConf[] = [];

interface LicensePlateBlurProps {
  imgRef: React.RefObject<HTMLImageElement | null>;
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  opts: {
    modelSize: number;
    confThresh: number;
    blurStrength: number; // 0–100
    setPerfReport: React.Dispatch<React.SetStateAction<PerformanceReport>>;
    featherPx?: number;
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
  plateInputName =
    (sess as unknown as { inputNames?: string[] }).inputNames?.[0] ?? "images";
  return { plateSession, plateInputName };
}

export const LicensePlateBlur = forwardRef<BlurHandler, LicensePlateBlurProps>(
  ({ imgRef, canvasRef, opts }, ref) => {
    const runningRef = useRef(false);

    const applyBluring = useCallback(async () => {
      const img = imgRef.current;
      const canvas = canvasRef.current;
      if (!img || !canvas) return;

      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      ctx.clearRect(0, 0, canvas.width, canvas.height);

      const filtered = filterByMinConf<BoxWithConf>(boxes, opts.confThresh);
      for (const b of filtered) {
        const sx = Math.max(0, Math.floor(b.x));
        const sy = Math.max(0, Math.floor(b.y));
        const sw = Math.min(canvas.width - sx, Math.ceil(b.w));
        const sh = Math.min(canvas.height - sy, Math.ceil(b.h));
        if (sw > 0 && sh > 0) {
          blurPatchWithFeather(
            ctx,
            img as HTMLImageElement,
            sx,
            sy,
            sw,
            sh,
            opts.blurStrength,
            opts.featherPx ?? 0
          );
        }
      }
    }, [canvasRef, imgRef, opts.blurStrength, opts.confThresh, opts.featherPx]);

    const run = useCallback(async () => {
      if (runningRef.current) return;
      runningRef.current = true;
      try {
        // Yield to the browser so UI (spinner) can paint before heavy sync work
        await new Promise<void>((resolve) =>
          requestAnimationFrame(() => resolve())
        );
        const img = imgRef.current;
        const canvas = canvasRef.current;
        if (!img || !canvas) return;

        const { plateSession, plateInputName } = await ensurePlateSession(
          LicensePlateBlurConstants.MODEL_URL
        );

        const t0 = performance.now();

        const modelSize = LicensePlateBlurConstants.MODEL_SIZE;
        const { input, scale, pad } = letterbox(img, modelSize);
        const tensor = new ort.Tensor("float32", input, [
          1,
          3,
          modelSize,
          modelSize,
        ]);

        const feeds: Record<string, Tensor> = {
          [plateInputName]: tensor as unknown as Tensor,
        };

        const t1 = performance.now();
        const out = await plateSession.run(feeds);
        const t2 = performance.now();

        const first = firstValue(out) as unknown as Tensor;
        const { data, dims } = get2D(first);
        const raw = parseYolo(data, dims, {
          conf: LicensePlateBlurConstants.CONFIDENCE_THRESHOLD,
          pad,
          scale,
          padRatio: LicensePlateBlurConstants.PAD_RATIO,
          max: 30000,
        });
        boxes = nms(
          raw,
          LicensePlateBlurConstants.IOU_THRESHOLD
        ) as BoxWithConf[];

        await applyBluring();

        const t3 = performance.now();
        const filteredCount = filterByMinConf<BoxWithConf>(
          boxes,
          opts.confThresh
        ).length;
        opts.setPerfReport({
          count: filteredCount,
          timings: {
            preprocess: t1 - t0,
            run: t2 - t1,
            post: t3 - t2,
            total: t3 - t0,
          },
          total: t3 - t0,
        });
      } catch (e) {
        console.log("Error inside of LicensePlateBlur:", e);
      } finally {
        runningRef.current = false;
      }
    }, [imgRef, canvasRef, applyBluring, opts]);

    const redraw = useCallback(async () => {
      await applyBluring();
    }, [applyBluring]);

    useImperativeHandle(
      ref,
      () => ({
        run,
        redraw,
        getDetections: () =>
          boxes.map((b) => ({ x: b.x, y: b.y, w: b.w, h: b.h } as Box)),
        reset: () => {
          boxes = [];
        },
      }),
      [run, redraw]
    );

    return null;
  }
);

export default LicensePlateBlur;
