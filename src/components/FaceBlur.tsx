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
import { drawBox, blurRegion } from "./utils/license-plate-blur-utils";

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

// const DEFAULT_BLUR = 35; // now interpreted as strength 0–100
// const DEFAULT_FADE = 40;

// Map 0–100 slider "strength" → kernel radius(px) + number of passes
// function strengthToBlur(strength: number): {
//   radiusPx: number;
//   passes: number;
// } {
//   const s = Math.max(0, Math.min(100, Math.round(strength)));
//   const radiusPx = Math.round(1 + (19 * s) / 100); // ≈ 1..20 px
//   const passes = s < 40 ? 1 : s < 75 ? 2 : 3; // 1..3 passes
//   return { radiusPx, passes };
// }

// { modelSize, confThresh, blurStrength, iouThresh, padRatio, setPerfReport, modelsBase, debugMode,}

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

      // 1) Try hardware FaceDetector first
      const FD = window.FaceDetector;
      if (FD) {
        try {
          const det = new FD({ fastMode: false, maxDetectedFaces: 50 });
          const t1 = performance.now();
          const faces = await det.detect(img);
          const t2 = performance.now();
          for (const f of faces) {
            const bb = (f.boundingBox ?? f) as DOMRect;
            const rect = { x: bb.x, y: bb.y, w: bb.width, h: bb.height };
            if (opts.debugMode) drawBox(ctx, rect);
            // Blur from the current canvas so it composes with plate blur
            blurRegion(ctx, canvas, rect, blur);
          }
          const t3 = performance.now();
          const perfs = {} as PerformanceReport;
          perfs.count = faces.length ?? 0;
          perfs.timings = {
            preprocess: t1 - t0,
            run: t2 - t1,
            post: t3 - t2,
            total: t3 - t0,
          };

          opts.setPerfReport(perfs);
        } catch {
          // fall through to JS model
        }
      }

      // 2) Fallback to face-api.js (requires models in /public)
      let faceapi: FaceApiNS | null = null;
      try {
        faceapi = (await import("face-api.js")) as unknown as FaceApiNS;
      } catch {
        throw new Error(
          "Face detection unavailable: FaceDetector API not present and 'face-api.js' not installed."
        );
      }

      // Try a few common model base paths
      const bases: Array<string> = [];
      if (modelsBase) bases.push(modelsBase);
      bases.push("/models/face", "/models");

      let loaded = false;
      for (const base of bases) {
        try {
          await faceapi.nets.tinyFaceDetector.loadFromUri(base);
          loaded = true;
          break;
        } catch {
          // try next base
        }
      }
      if (!loaded) {
        throw new Error(
          `TinyFaceDetector model not found under ${bases.join(", ")}`
        );
      }

      const t1 = performance.now();
      const detections = await faceapi.detectAllFaces(
        img,
        new faceapi.TinyFaceDetectorOptions({
          scoreThreshold: opts.confThresh ?? 0.6,
          inputSize: 512,
        })
      );
      const t2 = performance.now();

      for (const d of detections) {
        const rect = {
          x: d.box.x,
          y: d.box.y,
          w: d.box.width,
          h: d.box.height,
        };
        if (opts.debugMode) drawBox(ctx, rect);
        // Blur from the current canvas so it composes with plate blur
        blurRegion(ctx, canvas, rect, blur);
      }
      const t3 = performance.now();
      const perfs = {} as PerformanceReport;
      perfs.count = detections.length ?? 0;
      perfs.timings = {
        preprocess: t1 - t0,
        run: t2 - t1,
        post: t3 - t2,
        total: t3 - t0,
      };

      opts.setPerfReport(perfs);
    }, [blurStrength, canvasRef, imgRef, modelsBase, opts]);

    const redraw = useCallback(async () => {
      //
    }, []);

    useImperativeHandle(ref, () => ({ run, redraw }), [run, redraw]);

    // // const runFaceBlurOnCanvas = useCallback(
    // //   async (
    // //     img: HTMLImageElement,
    // //     canvas: HTMLCanvasElement,
    // //     opts: {
    // //       blurRadius?: number;
    // //       confThresh?: number;
    // //       modelsBase?: string;
    // //       debug?: boolean;
    // //     } = {}
    // //   ) => {
    // //     const t0 = performance.now();
    // //     const blur = Math.max(1, Math.round(opts.blurRadius ?? 12));
    // //     const ctx = canvas.getContext("2d");
    // //     if (!ctx)
    // //       return {
    // //         count: 0,
    // //         timings: { preprocess: 0, run: 0, post: 0, total: 0 },
    // //       };

    // //     // 1) Try hardware FaceDetector first
    // //     const FD = window.FaceDetector;
    // //     if (FD) {
    // //       try {
    // //         const det = new FD({ fastMode: true, maxDetectedFaces: 50 });
    // //         const t1 = performance.now();
    // //         const faces = await det.detect(img);
    // //         const t2 = performance.now();
    // //         for (const f of faces) {
    // //           const bb = (f.boundingBox ?? f) as DOMRect;
    // //           const rect = { x: bb.x, y: bb.y, w: bb.width, h: bb.height };
    // //           if (opts.debug) drawBox(ctx, rect);
    // //           // Blur from the current canvas so it composes with plate blur
    // //           blurRegion(ctx, canvas, rect, blur);
    // //         }
    // //         const t3 = performance.now();
    // //         return {
    // //           count: faces.length ?? 0,
    // //           timings: {
    // //             preprocess: t1 - t0,
    // //             run: t2 - t1,
    // //             post: t3 - t2,
    // //             total: t3 - t0,
    // //           },
    // //         };
    // //       } catch {
    // //         // fall through to JS model
    // //       }
    // //     }

    // //     // 2) Fallback to face-api.js (requires models in /public)
    // //     let faceapi: FaceApiNS | null = null;
    // //     try {
    // //       faceapi = (await import("face-api.js")) as unknown as FaceApiNS;
    // //     } catch {
    // //       throw new Error(
    // //         "Face detection unavailable: FaceDetector API not present and 'face-api.js' not installed."
    // //       );
    // //     }

    // //     // Try a few common model base paths
    // //     const bases: Array<string> = [];
    // //     if (opts.modelsBase) bases.push(opts.modelsBase);
    // //     bases.push("/models/face", "/models");

    // //     let loaded = false;
    // //     for (const base of bases) {
    // //       try {
    // //         await faceapi.nets.tinyFaceDetector.loadFromUri(base);
    // //         loaded = true;
    // //         break;
    // //       } catch {
    // //         // try next base
    // //       }
    // //     }
    // //     if (!loaded) {
    // //       throw new Error(
    // //         `TinyFaceDetector model not found under ${bases.join(", ")}`
    // //       );
    // //     }

    // //     const t1 = performance.now();
    // //     const detections = await faceapi.detectAllFaces(
    // //       img,
    // //       new faceapi.TinyFaceDetectorOptions({
    // //         scoreThreshold: opts.confThresh ?? 0.6,
    // //         inputSize: 416,
    // //       })
    // //     );
    // //     const t2 = performance.now();

    // //     for (const d of detections) {
    // //       const rect = {
    // //         x: d.box.x,
    // //         y: d.box.y,
    // //         w: d.box.width,
    // //         h: d.box.height,
    // //       };
    // //       if (opts.debug) drawBox(ctx, rect);
    // //       // Blur from the current canvas so it composes with plate blur
    // //       blurRegion(ctx, canvas, rect, blur);
    // //     }
    // //     const t3 = performance.now();
    // //   },
    // //   []
    // // );

    // // Load face-api.js models once on mount
    // useEffect(() => {
    //   let isMounted = true;

    //   Promise.all([faceapi.nets.tinyFaceDetector.loadFromUri("/models")])
    //     .then(() => {
    //       if (isMounted) console.log("Face models loaded");
    //     })
    //     .catch(() => {
    //       if (isMounted) console.log("Failed to load face models.");
    //     });
    //   return () => {
    //     isMounted = false;
    //   };
    // }, []);

    // useEffect(() => {}, []);

    // Detect faces when imageSrc changes
    // useEffect(() => {
    //   if (!imageSrc) return;
    //   const img = effectiveImageRef.current;
    //   if (!img) return;

    // const runDetection = async () => {
    //   setLoading("Detecting faces...");
    //   setFaces([]);
    //   setResultText("");
    //   const detections = await faceapi.detectAllFaces(
    //     img,
    //     new faceapi.TinyFaceDetectorOptions({
    //       inputSize: 416,
    //       scoreThreshold: 0.3,
    //     })
    //   );
    //   setFaces(detections);
    //   setResultText(`Faces detected: ${detections.length}`);
    //   setLoading("");
    // };

    //   img.onload = () => {
    //     setCanvasSize({
    //       width: img.naturalWidth,
    //       height: img.naturalHeight,
    //     });
    //     void runDetection();
    //   };
    //   if (img.complete && img.naturalWidth > 0) {
    //     setCanvasSize({
    //       width: img.naturalWidth,
    //       height: img.naturalHeight,
    //     });
    //     void runDetection();
    //   }
    // }, [imageSrc, effectiveImageRef]);

    // // Main draw function: draws the original image + all blurred face regions
    // const drawAll = useCallback(() => {
    //   const img = imgRef.current;
    //   const canvas = canvasRef.current;
    //   if (!img || !canvas || !img.src) return;
    //   canvas.width = canvasSize.width;
    //   canvas.height = canvasSize.height;
    //   const ctx = canvas.getContext("2d");
    //   if (!ctx) return;
    //   ctx.clearRect(0, 0, canvas.width, canvas.height);
    //   ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

    //   const { radiusPx, passes } = strengthToBlur(blurStrength);

    //   faces.forEach((face) => {
    //     const box = face.box;
    //     blurRegionFeathered(
    //       ctx,
    //       img,
    //       box.x,
    //       box.y,
    //       box.width,
    //       box.height,
    //       radiusPx,
    //       passes,
    //       fadeEdge
    //     );
    //   });
    // }, [
    //   blurStrength,
    //   imgRef,
    //   canvas,
    // ]);

    // Redraw on any change
    // useEffect(() => {
    //   drawAll();
    // }, [drawAll]);

    // Helper: feathered/soft mask blurred region (supports multi-pass strength)
    // const blurRegionFeathered = (
    //   ctx: CanvasRenderingContext2D,
    //   img: HTMLImageElement,
    //   x: number,
    //   y: number,
    //   width: number,
    //   height: number,
    //   radiusPx: number,
    //   passes: number,
    //   fade: number
    // ) => {
    //   // Clamp box to image bounds
    //   const sx = Math.max(0, Math.floor(x));
    //   const sy = Math.max(0, Math.floor(y));
    //   const sw = Math.min(ctx.canvas.width - sx, Math.ceil(width));
    //   const sh = Math.min(ctx.canvas.height - sy, Math.ceil(height));
    //   if (sw <= 0 || sh <= 0) return;

    //   // 1. Extract region from original (never blur an already blurred canvas)
    //   const region = document.createElement("canvas");
    //   region.width = sw;
    //   region.height = sh;
    //   const rctx = region.getContext("2d");
    //   if (!rctx) return;
    //   rctx.drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh);

    //   // 2. Multi-pass blur on a double-buffer pair
    //   const A = document.createElement("canvas");
    //   const B = document.createElement("canvas");
    //   A.width = B.width = sw;
    //   A.height = B.height = sh;
    //   const a = A.getContext("2d");
    //   const b = B.getContext("2d");
    //   if (!a || !b) return;

    //   // start with original region in A
    //   a.drawImage(region, 0, 0);
    //   for (let i = 0; i < passes; i++) {
    //     b.filter = `blur(${radiusPx}px)`;
    //     b.drawImage(A, 0, 0); // A -> B blurred
    //     b.filter = "none";
    //     // swap A<->B for next pass
    //     a.clearRect(0, 0, sw, sh);
    //     a.drawImage(B, 0, 0);
    //     b.clearRect(0, 0, sw, sh);
    //   }

    //   // 3. Build a feathered alpha mask (radial gradient)
    //   const mask = document.createElement("canvas");
    //   mask.width = sw;
    //   mask.height = sh;
    //   const mctx = mask.getContext("2d");
    //   if (!mctx) return;
    //   const cx = sw / 2;
    //   const cy = sh / 2;
    //   const rx = sw / 2;
    //   const ry = sh / 2;
    //   const grad = mctx.createRadialGradient(
    //     cx,
    //     cy,
    //     Math.max(0, Math.min(rx, ry) - fade),
    //     cx,
    //     cy,
    //     Math.max(rx, ry)
    //   );
    //   grad.addColorStop(0, "rgba(0,0,0,1)");
    //   grad.addColorStop(1, "rgba(0,0,0,0)");
    //   mctx.fillStyle = grad;
    //   mctx.fillRect(0, 0, sw, sh);

    //   // 4. Composite: apply mask to blurred output, then draw back
    //   const comp = document.createElement("canvas");
    //   comp.width = sw;
    //   comp.height = sh;
    //   const cctx = comp.getContext("2d");
    //   if (!cctx) return;
    //   cctx.drawImage(A, 0, 0); // final blurred image is in A
    //   cctx.globalCompositeOperation = "destination-in";
    //   cctx.drawImage(mask, 0, 0);
    //   cctx.globalCompositeOperation = "source-over";

    //   ctx.drawImage(comp, sx, sy);
    // };

    // File upload handler
    // const handleFileChange = useCallback((e: ChangeEvent<HTMLInputElement>) => {
    //   setFaces([]);
    //   setResultText("");
    //   if (!e.target.files?.length) return;
    //   const file = e.target.files[0];
    //   if (!file) return;
    //   setLoading("Loading image...");
    //   const reader = new window.FileReader();
    //   reader.onload = (ev) => {
    //     setImageSrc(ev.target?.result as string);
    //     setLoading("");
    //   };
    //   reader.onerror = () => {
    //     setLoading("Error loading image.");
    //   };
    //   reader.readAsDataURL(file);
    // }, []);

    return <></>;
    //   return (
    // <Card.Footer className="d-flex flex-column gap-1 small text-secondary">
    //   <div className="d-flex justify-content-between">
    //     <span>
    //       <p>"Detections: plates detections.plates · faces detections.faces"</p>
    //     </span>
    //   </div>
    //   <div className="d-flex flex-wrap gap-3">
    //     {perfPlates && (
    //       <div>
    //         Plates ⏱ pre {perfPlates.preprocess.toFixed(1)}ms · run{" "}
    //         {perfPlates.run.toFixed(1)}ms · post {perfPlates.post.toFixed(1)}ms
    //         · total {perfPlates.total.toFixed(1)}ms
    //       </div>
    //     )}
    //     {perfFaces && (
    //       <span>
    //         Faces ⏱ pre {perfFaces.preprocess.toFixed(1)}ms · run{" "}
    //         {perfFaces.run.toFixed(1)}ms · post {perfFaces.post.toFixed(1)}
    //         ms · total {perfFaces.total.toFixed(1)}ms
    //       </span>
    //     )}
    //   </div>
    // </Card.Footer>
  }
);

export default FaceBlur;
