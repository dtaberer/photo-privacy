import { forwardRef, useImperativeHandle, useCallback, RefObject } from "react";
import { FaceBlurConstants } from "./constants";
import type { BlurHandler, PerformanceReport } from "@/types/detector-types";
import type { FaceBox as UtilsFaceBox } from "./utils/face-blur-utils";
import { v4 as uuidv4 } from "uuid";

import {
  clamp,
  cssToCanvasRect,
  adjustUp,
  blurPatchWithFeather,
  isFaceApiNS,
} from "./utils/face-blur-utils";

type FaceBox = UtilsFaceBox;

export type FaceDetectorBox =
  | { boundingBox: DOMRectReadOnly }
  | { x: number; y: number; width: number; height: number }
  | { box: { x: number; y: number; width: number; height: number } };

type FaceApiCompatNS = typeof import("face-api.js");

let facesCache: FaceBox[] = [];

interface FaceBlurProps {
  imgRef: RefObject<HTMLImageElement>;
  canvasRef: RefObject<HTMLCanvasElement>;
  opts: {
    modelSize: number;
    confThresh: number; // 0..1
    blurStrength: number; // px
    featherPx?: number; // px
    setPerfReport: React.Dispatch<React.SetStateAction<PerformanceReport>>;
  };
}

const newFaceBox = (
  x: number,
  y: number,
  w: number,
  h: number,
  score?: number
): UtilsFaceBox => {
  return { id: uuidv4(), x, y, w, h, score, visible: true };
};

export const FaceBlur = forwardRef<BlurHandler, FaceBlurProps>(
  ({ imgRef, canvasRef, opts }, ref) => {
    const FD = (
      globalThis as unknown as {
        FaceDetector?: new (opts?: unknown) => {
          detect: (
            el: HTMLImageElement
          ) => Promise<
            Array<
              | { boundingBox: DOMRectReadOnly }
              | { x: number; y: number; width: number; height: number }
              | { box: { x: number; y: number; width: number; height: number } }
            >
          >;
        };
      }
    ).FaceDetector;

    const run = useCallback(async () => {
      const img = imgRef.current;
      const canvas = canvasRef.current;
      if (
        !img ||
        !canvas ||
        !img.complete ||
        img.naturalWidth === 0 ||
        img.naturalHeight === 0
      )
        return;
      const t0 = performance.now();
      facesCache = [];
      // Initial pass uses constant density; interactive slider updates happen via redraw()
      const blur = FaceBlurConstants.BLUR_DENSITY;
      const conf = clamp(
        opts.confThresh ?? FaceBlurConstants.CONFIDENCE_THRESHOLD,
        0.01,
        0.99
      );
      const padRatio = FaceBlurConstants.PAD_RATIO;

      if (FD) {
        let t1 = performance.now();
        let t2 = t1;
        try {
          const det = new FD({ fastMode: false, maxDetectedFaces: 64 });
          t1 = performance.now();
          const facesCss = await det.detect(img);
          t2 = performance.now();

          facesCache = facesCss.map((f: FaceDetectorBox) => {
            const bb =
              "boundingBox" in f
                ? f.boundingBox
                : "box" in f
                ? f.box
                : { x: f.x, y: f.y, width: f.width, height: f.height };
            return cssToCanvasRect(img, canvas, bb);
          });
        } catch {
          facesCache = [];
        }

        try {
          const ctx = canvas.getContext("2d");
          const filtered = facesCache.filter(
            (base) => (base.score ?? 1) >= conf
          );
          for (const base of filtered) {
            const r0 = base;
            const W = canvas.width,
              H = canvas.height;
            const rx = clamp(Math.round(r0.x - r0.w * padRatio), 0, W);
            const ry = clamp(Math.round(r0.y - r0.h * padRatio), 0, H);
            const rw = clamp(Math.round(r0.w * (1 + 2 * padRatio)), 1, W - rx);
            const rh = clamp(Math.round(r0.h * (1 + 2 * padRatio)), 1, H - ry);
            const r = adjustUp(newFaceBox(rx, ry, rw, rh), W, H, 0.12);

            if (ctx) {
              blurPatchWithFeather(
                ctx,
                img,
                r.x,
                r.y,
                r.w,
                r.h,
                blur,
                FaceBlurConstants.FEATHER_PX
              );
            }
          }
        } catch {
          /* ignore draw errors in tests */
        }

        const t3 = performance.now();
        opts.setPerfReport({
          count: facesCache.filter((b) => (b.score ?? 1) >= conf).length,
          total: t3 - t0,
          timings: {
            preprocess: t1 - t0,
            run: t2 - t1,
            post: t3 - t2,
            total: t3 - t0,
          },
        });
        return;
      }

      let faceapiMod: unknown;
      try {
        faceapiMod = await import("face-api.js");
      } catch {
        faceapiMod = undefined;
      }
      if (!isFaceApiNS(faceapiMod)) {
        opts.setPerfReport({
          count: 0,
          total: 0,
          timings: { preprocess: 0, run: 0, post: 0, total: 0 },
        });
        return;
      }
      const faceapi: FaceApiCompatNS = faceapiMod as FaceApiCompatNS;

      // Try a couple of base paths for models
      const BASE =
        (import.meta as unknown as { env?: Record<string, string> }).env
          ?.BASE_URL ?? "/";
      const bp = BASE.endsWith("/") ? BASE : `${BASE}/`;
      const bases = [
        FaceBlurConstants.MODELS_URL,
        `${bp}models/face`,
        `${bp}models`,
        "/models/face",
        "/models",
      ].filter((b): b is string => typeof b === "string" && b.length > 0);

      let loaded = false;

      for (const b of bases) {
        try {
          await faceapi.nets.tinyFaceDetector.loadFromUri(b);
          loaded = true;
          break;
        } catch {
          /* try next */
        }
      }
      if (!loaded) {
        opts.setPerfReport({
          count: 0,
          total: 0,
          timings: { preprocess: 0, run: 0, post: 0, total: 0 },
        });
        return;
      }

      const t1 = performance.now();
      const size = clamp(
        Math.round((opts.modelSize ?? 544) / 32) * 32,
        128,
        1024
      );
      const detOpts = new faceapi.TinyFaceDetectorOptions({
        scoreThreshold: conf,
        inputSize: size,
      });
      const detections = (await faceapi.detectAllFaces(img, detOpts)) as Array<{
        box: { x: number; y: number; width: number; height: number };
        score?: number;
      }>;
      const t2 = performance.now();

      const sx = canvas.width / (img.naturalWidth || canvas.width);
      const sy = canvas.height / (img.naturalHeight || canvas.height);

      facesCache = detections.map((d) =>
        newFaceBox(
          Math.round(d.box.x * sx),
          Math.round(d.box.y * sy),
          Math.round(d.box.width * sx),
          Math.round(d.box.height * sy),
          d.score
        )
      );

      // Draw now using cached faces (if a 2D context is available)
      const ctx = canvas.getContext("2d");
      const filtered = facesCache.filter((b) => (b.score ?? 1) >= conf);
      for (const base of filtered) {
        const W = canvas.width,
          H = canvas.height;
        const rx = clamp(Math.round(base.x - base.w * padRatio), 0, W);
        const ry = clamp(Math.round(base.y - base.h * padRatio), 0, H);
        const rw = clamp(Math.round(base.w * (1 + 2 * padRatio)), 1, W - rx);
        const rh = clamp(Math.round(base.h * (1 + 2 * padRatio)), 1, H - ry);
        const r = adjustUp(newFaceBox(rx, ry, rw, rh), W, H, 0.12);

        if (ctx) {
          blurPatchWithFeather(
            ctx,
            img,
            r.x,
            r.y,
            r.w,
            r.h,
            blur,
            FaceBlurConstants.FEATHER_PX
          );
        }
      }

      const t3 = performance.now();
      opts.setPerfReport({
        count: filtered.length,
        total: t3 - t0,
        timings: {
          preprocess: t1 - t0,
          run: t2 - t1,
          post: t3 - t2,
          total: t3 - t0,
        },
      });
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [imgRef, canvasRef]);

    // Destructure opts to stable, typed locals for hook deps
    const { blurStrength, confThresh, featherPx, setPerfReport } = opts;

    const redraw = useCallback(async () => {
      const img = imgRef.current;
      const canvas = canvasRef.current;
      const padRatio = FaceBlurConstants.PAD_RATIO;

      // Guard against redraw before image loads (e.g., when previewUrl changes)
      if (
        !img ||
        !canvas ||
        !img.complete ||
        img.naturalWidth === 0 ||
        img.naturalHeight === 0
      ) {
        return;
      }
      const ctx = canvas.getContext("2d");

      if (!ctx) return;
      const blur = Math.max(1, Math.round(blurStrength));
      const conf = clamp(confThresh ?? 0.5, 0.01, 0.99);
      const t0 = performance.now();
      const filtered = facesCache.filter((b) => (b.score ?? 1) >= conf);
      for (const base of filtered) {
        const W = canvas.width,
          H = canvas.height;
        const rx = clamp(Math.round(base.x - base.w * padRatio), 0, W);
        const ry = clamp(Math.round(base.y - base.h * padRatio), 0, H);
        const rw = clamp(Math.round(base.w * (1 + 2 * padRatio)), 1, W - rx);
        const rh = clamp(Math.round(base.h * (1 + 2 * padRatio)), 1, H - ry);
        const r = adjustUp(newFaceBox(rx, ry, rw, rh), W, H, 0.12);

        blurPatchWithFeather(
          ctx,
          img,
          r.x,
          r.y,
          r.w,
          r.h,
          blur,
          featherPx ?? 0
        );
      }
      const t1 = performance.now();
      setPerfReport({
        count: filtered.length,
        total: t1 - t0,
        timings: { preprocess: 0, run: 0, post: t1 - t0, total: t1 - t0 },
      });
    }, [imgRef, canvasRef, blurStrength, confThresh, featherPx, setPerfReport]);

    useImperativeHandle(
      ref,
      () => ({
        run,
        redraw,
        getDetections: () => facesCache.slice(),
        reset: () => {
          facesCache = [];
        },
      }),
      [run, redraw]
    );

    return null;
  }
);

export default FaceBlur;
