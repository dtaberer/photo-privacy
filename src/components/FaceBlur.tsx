import React, {
  forwardRef,
  useImperativeHandle,
  useCallback,
  RefObject,
  SetStateAction,
  Dispatch,
} from "react";

// import * as faceapi from "face-api.js";

import { FaceApiNS } from "@/types/face-blur-types";
import { drawBox } from "./utils/license-plate-blur-utils";
import { blurPatchWithMargin } from "./utils/face-blur-utils";

interface FaceBlurProps {
  imgRef: RefObject<HTMLImageElement>;
  canvasRef: RefObject<HTMLCanvasElement>;
  opts: {
    modelSize: number;
    confThresh: number;
    blurStrength: number;
    iouThresh: number;
    padRatio: number;
    setPerfReport: Dispatch<SetStateAction<PerformanceReport>>;
    modelsBase?: string | null;
    debugMode?: boolean;
  };
}

type FaceBox = { x: number; y: number; w: number; h: number; score?: number };
let faces: FaceBox[] = [];

function filterByScore(arr: FaceBox[], min: number) {
  return arr.filter((f) => (typeof f.score === "number" ? f.score : 1) >= min);
}

function cssToCanvasRect(
  img: HTMLImageElement,
  canvas: HTMLCanvasElement,
  r: { x: number; y: number; width: number; height: number }
): FaceBox {
  // FaceDetector reports CSS px; canvas draws in *internal* px
  const scaleX = canvas.width / img.clientWidth;
  const scaleY = canvas.height / img.clientHeight;
  return {
    x: r.x * scaleX,
    y: r.y * scaleY,
    w: r.width * scaleX,
    h: r.height * scaleY,
  };
}

export const FaceBlur = forwardRef<BlurHandler, FaceBlurProps>(
  ({ imgRef, canvasRef, opts }, ref) => {
    //
    const { blurStrength, modelsBase } = opts;

    const run = useCallback(async () => {
      const img = imgRef.current;
      const canvas = canvasRef.current;
      if (!img || !canvas) return;

      const t0 = performance.now();
      const blur = Math.max(1, Math.round(blurStrength));
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      // 1) Try hardware FaceDetector
      const FD = (window as any).FaceDetector as
        | (new (opts?: any) => {
            detect: (el: HTMLImageElement) => Promise<FaceBox[]>;
          })
        | undefined;

      if (FD) {
        try {
          const det = new FD({ fastMode: false, maxDetectedFaces: 50 });
          const t1 = performance.now();
          const facesCss = await det.detect(img);
          const t2 = performance.now();

          // Map CSS → canvas internal px
          faces = facesCss.map((f: any) => {
            const bb = (f.boundingBox ?? f) as DOMRect;
            return cssToCanvasRect(img, canvas, {
              x: bb.x,
              y: bb.y,
              width: bb.width,
              height: bb.height,
            });
          });

          for (const r of faces) {
            if (opts.debugMode) drawBox(ctx, r);
            // compose with plate blur: blur from the *current canvas*
            blurPatchWithMargin(ctx, img, r.x, r.y, r.w, r.h, blur);
          }

          const t3 = performance.now();
          opts.setPerfReport({
            count: faces.length,
            timings: {
              preprocess: t1 - t0,
              run: t2 - t1,
              post: t3 - t2,
              total: t3 - t0,
            },
            total: t3 - t0,
          });
          return; // <-- IMPORTANT: don't fall through to face-api.js
        } catch {
          // fall through to JS model
        }
      }

      // 2) Fallback: face-api.js (TinyFaceDetector)
      let faceapi: FaceApiNS | null = null;
      try {
        faceapi = (await import("face-api.js")) as unknown as FaceApiNS;
      } catch {
        throw new Error(
          "Face detection unavailable: FaceDetector API not present and 'face-api.js' not installed."
        );
      }

      const bases: string[] = [];
      if (opts.modelsBase) bases.push(opts.modelsBase);
      bases.push("/models/face", "/models");

      let loaded = false;
      for (const base of bases) {
        try {
          await faceapi.nets.tinyFaceDetector.loadFromUri(base);
          loaded = true;
          break;
        } catch {
          /* try next */
        }
      }
      if (!loaded)
        throw new Error(
          `TinyFaceDetector model not found under ${bases.join(", ")}`
        );

      const t1 = performance.now();
      const detections = await faceapi.detectAllFaces(
        img,
        new faceapi.TinyFaceDetectorOptions({
          scoreThreshold: opts.confThresh ?? 0.6,
          inputSize: 512,
        })
      );
      const t2 = performance.now();

      // face-api boxes are already in image px → fits your canvas (which you set to natural size)
      faces = detections.map((d) => ({
        x: d.box.x,
        y: d.box.y,
        w: d.box.width,
        h: d.box.height,
        score: (d as any).score ?? 1,
      }));

      // Optional extra filter (in case you set a very low scoreThreshold)
      const filtered = filterByScore(faces, opts.confThresh ?? 0);
      for (const r of filtered) {
        if (opts.debugMode) drawBox(ctx, r);
        blurPatchWithMargin(ctx, img, r.x, r.y, r.w, r.h, blur);
      }

      const t3 = performance.now();
      opts.setPerfReport({
        count: filtered.length,
        timings: {
          preprocess: t1 - t0,
          run: t2 - t1,
          post: t3 - t2,
          total: t3 - t0,
        },
        total: t3 - t0,
      });
    }, [blurStrength, canvasRef, imgRef, opts]);

    const redraw = useCallback(() => {
      const img = imgRef.current;
      const canvas = canvasRef.current;
      if (!img || !canvas) return;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      const blur = Math.max(1, Math.round(blurStrength));
      const filtered = filterByScore(faces, opts.confThresh ?? 0);

      // DO NOT clear the canvas here—plates already drew first
      for (const r of filtered) {
        if (opts.debugMode) drawBox(ctx, r);
        blurPatchWithMargin(ctx, img, r.x, r.y, r.w, r.h, blur);
      }
    }, [blurStrength, canvasRef, imgRef, opts.confThresh, opts.debugMode]);

    useImperativeHandle(ref, () => ({ run, redraw }), [run, redraw]);

    return <></>;
  }
);

export default FaceBlur;
