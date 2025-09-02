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
import {
  blurPatchWithFeather,
  cssToCanvasRect,
  FaceBox,
  grow,
} from "./utils/face-blur-utils";

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
    featherPx?: number;
  };
}

let faces: FaceBox[] = [];

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

          const conf = Math.min(0.99, Math.max(0.01, opts.confThresh ?? 0.5));
          const pad = Math.min(0.5, Math.max(0, opts.padRatio ?? 0.1));
          for (const base of faces) {
            if ((base.score ?? 1) < conf) continue;
            const r = grow(base, pad, canvas.width, canvas.height);
            if (opts.debugMode) drawBox(ctx, r);
            blurPatchWithFeather(
              ctx,
              img,
              r.x,
              r.y,
              r.w,
              r.h,
              blur,
              opts.featherPx ?? 0
            );
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

      const conf = Math.min(0.99, Math.max(0.01, opts.confThresh ?? 0.5));
      const size = Math.max(
        128,
        Math.min(1024, Math.round((opts.modelSize ?? 544) / 32) * 32)
      );
      const detections = await faceapi.detectAllFaces(
        img,
        new faceapi.TinyFaceDetectorOptions({
          scoreThreshold: conf,
          inputSize: size,
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
      const pad = Math.min(0.5, Math.max(0, opts.padRatio ?? 0.1));
      for (const base of faces) {
        if ((base.score ?? 1) < conf) continue;
        const r = grow(base, pad, canvas.width, canvas.height);
        if (opts.debugMode) drawBox(ctx, r);
        blurPatchWithFeather(
          ctx,
          img,
          r.x,
          r.y,
          r.w,
          r.h,
          blur,
          opts.featherPx ?? 0
        );
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
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [
      blurStrength,
      canvasRef,
      imgRef,
      opts.confThresh,
      opts.debugMode,
      opts.featherPx,
    ]);

    const redraw = useCallback(() => {
      const img = imgRef.current;
      const canvas = canvasRef.current;
      if (!img || !canvas) return;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      const blur = Math.max(1, Math.round(blurStrength));
      const conf = Math.min(0.99, Math.max(0.01, opts.confThresh ?? 0.5));
      const pad = Math.min(0.5, Math.max(0, opts.padRatio ?? 0.1));
      // DO NOT clear the canvas here—plates already drew first
      for (const base of faces) {
        if ((base.score ?? 1) < conf) continue;
        const r = grow(base, pad, canvas.width, canvas.height);
        if (opts.debugMode) drawBox(ctx, r);
        blurPatchWithFeather(
          ctx,
          img,
          r.x,
          r.y,
          r.w,
          r.h,
          blur,
          opts.featherPx ?? 0
        );
      }
    }, [
      blurStrength,
      canvasRef,
      imgRef,
      opts.confThresh,
      opts.debugMode,
      opts.featherPx,
      opts.padRatio,
    ]);

    useImperativeHandle(ref, () => ({ run, redraw }), [run, redraw]);

    return <></>;
  }
);

export default FaceBlur;
