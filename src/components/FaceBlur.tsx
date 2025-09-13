import {
  forwardRef,
  useImperativeHandle,
  useCallback,
  RefObject,
  useRef,
  useEffect,
} from "react";
import { FaceBlurConstants } from "./constants";
import type { BlurHandler, PerformanceReport } from "@/types/detector-types";
import {
  newFaceBox,
  type FaceBox as UtilsFaceBox,
} from "./utils/face-blur-utils";

import {
  clamp,
  cssToCanvasRect,
  blurPatchWithFeather,
  isFaceApiNS,
} from "./utils/face-blur-utils";
import { loadFaceModel, detectFaces } from "./utils/face-detector-onnx";

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

    // Track latest UI confidence so run() uses fresh value despite stable callback
    const latestConfRef = useRef(opts.confThresh);
    useEffect(() => {
      latestConfRef.current = opts.confThresh;
    }, [opts.confThresh]);

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
      // Yield a frame so the busy spinner can render before heavy work
      await new Promise<void>((resolve) =>
        requestAnimationFrame(() => resolve())
      );
      const t0 = performance.now();
      facesCache = [];
      // Initial pass uses constant density (capped to avoid platform-specific blur artifacts)
      const blur = Math.min(FaceBlurConstants.BLUR_DENSITY, 30);
      const conf = clamp(FaceBlurConstants.CONFIDENCE_THRESHOLD, 0.01, 0.99);
      const padRatio = FaceBlurConstants.PAD_RATIO;

      if (FD) {
        let t1 = performance.now();
        let t2 = t1;
        try {
          const det = new FD({
            fastMode: FaceBlurConstants.FAST_MODE,
            maxDetectedFaces: FaceBlurConstants.MAX_DETECTED_FACES,
          });
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

        // Draw and report metrics for FaceDetector path
        try {
          const ctx = canvas.getContext("2d");
          const filtered = facesCache.filter(
            (base) => (base.score ?? 1) >= conf
          );
          for (const base of filtered) {
            const W = canvas.width,
              H = canvas.height;
            const minSide = Math.min(base.w, base.h);
            const p =
              minSide <= FaceBlurConstants.PAD_SMALL_SIDE
                ? FaceBlurConstants.PAD_RATIO_AT_SMALL
                : minSide >= FaceBlurConstants.PAD_LARGE_SIDE
                ? FaceBlurConstants.PAD_RATIO_AT_LARGE
                : padRatio;
            const rx = clamp(Math.round(base.x - base.w * p), 0, W);
            const ry = clamp(Math.round(base.y - base.h * p), 0, H);
            const rw = clamp(Math.round(base.w * (1 + 2 * p)), 1, W - rx);
            const rh = clamp(Math.round(base.h * (1 + 2 * p)), 1, H - ry);
            const ryShift = clamp(
              Math.round(ry - rh * FaceBlurConstants.VERTICAL_SHIFT),
              0,
              H - 1
            );
            const rhShift = clamp(
              Math.round(rh + rh * FaceBlurConstants.VERTICAL_SHIFT),
              1,
              H - ryShift
            );
            const ox =
              (FaceBlurConstants.OFFSET_X | 0) +
              Math.round(rw * (FaceBlurConstants.OFFSET_FX ?? 0));
            const oy =
              (FaceBlurConstants.OFFSET_Y | 0) +
              Math.round(rhShift * (FaceBlurConstants.OFFSET_FY ?? 0));
            const fx = clamp(rx + ox, 0, Math.max(0, W - 1));
            const fy = clamp(ryShift + oy, 0, Math.max(0, H - 1));
            const fw = clamp(rw, 1, W - fx);
            const fh = clamp(rhShift, 1, H - fy);
            const r = newFaceBox(fx, fy, fw, fh);

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
        const uiConf = clamp(latestConfRef.current ?? 0.6, 0.01, 0.99);
        const filteredCount = facesCache.filter(
          (b) => (b.score ?? 1) >= uiConf
        ).length;
        opts.setPerfReport({
          count: filteredCount,
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

      try {
        console.log("Loading ONNX model...");
        await loadFaceModel(FaceBlurConstants.MODEL_URL);
        console.log("Using ONNX face detection model");
        const off = document.createElement("canvas");
        off.width = img.naturalWidth;
        off.height = img.naturalHeight;
        const offCtx = off.getContext("2d");
        if (!offCtx) throw new Error("no 2d context");
        offCtx.drawImage(img, 0, 0, off.width, off.height);
        const imageData = offCtx.getImageData(0, 0, off.width, off.height);
        const t1 = performance.now();
        const boxes = await detectFaces(imageData, conf);
        const t2 = performance.now();

        const sx = canvas.width / off.width;
        const sy = canvas.height / off.height;
        facesCache = boxes
          .slice(0, FaceBlurConstants.MAX_DETECTED_FACES)
          .map((b) =>
            newFaceBox(
              Math.round(b.x * sx),
              Math.round(b.y * sy),
              Math.round(b.w * sx),
              Math.round(b.h * sy),
              b.score
            )
          );

        redraw();
        const t3 = performance.now();
        // Report count based on current UI threshold, not raw detections
        const uiConf = clamp(latestConfRef.current ?? 0.6, 0.01, 0.99);
        const filteredCount = facesCache.filter(
          (b) => (b.score ?? 1) >= uiConf
        ).length;
        opts.setPerfReport({
          count: filteredCount,
          total: t3 - t0,
          timings: {
            preprocess: t1 - t0,
            run: t2 - t1,
            post: t3 - t2,
            total: t3 - t0,
          },
        });
        return;
      } catch (e: unknown) {
        console.error("Failed to load ONNX model");
        console.error("Falling back to face-api.js");
        console.log(
          "error: ",
          e,
          (e as Error)?.stack,
          FaceBlurConstants.MODEL_URL
        );
        /* fall back to face-api.js */
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
        const minSide = Math.min(base.w, base.h);
        const p =
          minSide <= FaceBlurConstants.PAD_SMALL_SIDE
            ? FaceBlurConstants.PAD_RATIO_AT_SMALL
            : minSide >= FaceBlurConstants.PAD_LARGE_SIDE
            ? FaceBlurConstants.PAD_RATIO_AT_LARGE
            : padRatio;
        const rx = clamp(Math.round(base.x - base.w * p), 0, W);
        const ry = clamp(Math.round(base.y - base.h * p), 0, H);
        const rw = clamp(Math.round(base.w * (1 + 2 * p)), 1, W - rx);
        const rh = clamp(Math.round(base.h * (1 + 2 * p)), 1, H - ry);
        // Use symmetric padding box without vertical shift to align blur to face
        const ryShift = clamp(
          Math.round(ry - rh * FaceBlurConstants.VERTICAL_SHIFT),
          0,
          H - 1
        );
        const rhShift = clamp(
          Math.round(rh + rh * FaceBlurConstants.VERTICAL_SHIFT),
          1,
          H - ryShift
        );
        const ox =
          (FaceBlurConstants.OFFSET_X | 0) +
          Math.round(rw * (FaceBlurConstants.OFFSET_FX ?? 0));
        const oy =
          (FaceBlurConstants.OFFSET_Y | 0) +
          Math.round(rhShift * (FaceBlurConstants.OFFSET_FY ?? 0));
        const fx = clamp(rx + ox, 0, Math.max(0, W - 1));
        const fy = clamp(ryShift + oy, 0, Math.max(0, H - 1));
        const fw = clamp(rw, 1, W - fx);
        const fh = clamp(rhShift, 1, H - fy);
        const r = newFaceBox(fx, fy, fw, fh);

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
      // Report count based on current UI threshold, not the constant
      const uiConf = clamp(latestConfRef.current ?? 0.6, 0.01, 0.99);
      const filteredCount = facesCache.filter(
        (b) => (b.score ?? 1) >= uiConf
      ).length;
      opts.setPerfReport({
        count: filteredCount,
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
    const { blurStrength, confThresh, featherPx } = opts;

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
      // Cap blur to avoid cases where very large radii visually collapse or seem to "un-blur"
      const blur = Math.min(30, Math.max(1, Math.round(blurStrength)));
      const conf = clamp(confThresh ?? 0.6, 0.01, 0.99);
      const filtered = facesCache.filter((b) => (b.score ?? 1) >= conf);
      for (const base of filtered) {
        const W = canvas.width,
          H = canvas.height;
        const minSide = Math.min(base.w, base.h);
        const p =
          minSide <= FaceBlurConstants.PAD_SMALL_SIDE
            ? FaceBlurConstants.PAD_RATIO_AT_SMALL
            : minSide >= FaceBlurConstants.PAD_LARGE_SIDE
            ? FaceBlurConstants.PAD_RATIO_AT_LARGE
            : padRatio;
        const rx = clamp(Math.round(base.x - base.w * p), 0, W);
        const ry = clamp(Math.round(base.y - base.h * p), 0, H);
        const rw = clamp(Math.round(base.w * (1 + 2 * p)), 1, W - rx);
        const rh = clamp(Math.round(base.h * (1 + 2 * p)), 1, H - ry);
        // Use symmetric padding box without vertical shift to align blur to face
        const ryShift = clamp(
          Math.round(ry - rh * FaceBlurConstants.VERTICAL_SHIFT),
          0,
          H - 1
        );
        const rhShift = clamp(
          Math.round(rh + rh * FaceBlurConstants.VERTICAL_SHIFT),
          1,
          H - ryShift
        );
        const ox =
          (FaceBlurConstants.OFFSET_X | 0) +
          Math.round(rw * (FaceBlurConstants.OFFSET_FX ?? 0));
        const oy =
          (FaceBlurConstants.OFFSET_Y | 0) +
          Math.round(rhShift * (FaceBlurConstants.OFFSET_FY ?? 0));
        const fx = clamp(rx + ox, 0, Math.max(0, W - 1));
        const fy = clamp(ryShift + oy, 0, Math.max(0, H - 1));
        const fw = clamp(rw, 1, W - fx);
        const fh = clamp(rhShift, 1, H - fy);
        const r = newFaceBox(fx, fy, fw, fh);

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
      // Skip perf report updates during interactive redraw to avoid jank
      // (perf is reported by the detection run path instead)
    }, [imgRef, canvasRef, blurStrength, confThresh, featherPx]);

    useImperativeHandle(
      ref,
      () => ({
        run,
        redraw,
        getDetections: () => facesCache.slice(),
        getFilteredCount: (conf: number) => {
          const c = clamp(conf ?? 0.6, 0.01, 0.99);
          return facesCache.filter((b) => (b.score ?? 1) >= c).length;
        },
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
