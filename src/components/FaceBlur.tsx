import {
  useRef,
  useState,
  useCallback,
  useEffect,
  type ChangeEvent,
  type RefObject,
  type FC,
} from "react";

import * as faceapi from "face-api.js";

interface FaceBlurProps {
  imageRef?: RefObject<HTMLImageElement>;
  canvasRef?: RefObject<HTMLCanvasElement>;
}

const DEFAULT_BLUR = 35; // now interpreted as strength 0–100
const DEFAULT_FADE = 40;

// Map 0–100 slider "strength" → kernel radius(px) + number of passes
function strengthToBlur(strength: number): {
  radiusPx: number;
  passes: number;
} {
  const s = Math.max(0, Math.min(100, Math.round(strength)));
  const radiusPx = Math.round(1 + (19 * s) / 100); // ≈ 1..20 px
  const passes = s < 40 ? 1 : s < 75 ? 2 : 3; // 1..3 passes
  return { radiusPx, passes };
}

export const FaceBlur: FC<FaceBlurProps> = ({ imageRef, canvasRef }) => {
  // Internal refs if not provided
  const internalImageRef = useRef<HTMLImageElement>(null);
  const internalCanvasRef = useRef<HTMLCanvasElement>(null);

  const effectiveImageRef = imageRef ?? internalImageRef;
  const effectiveCanvasRef = canvasRef ?? internalCanvasRef;

  const [loading, setLoading] = useState("");
  const [resultText, setResultText] = useState("");
  const [blurStrength, setBlurStrength] = useState(DEFAULT_BLUR); // strength 0–100
  const [fadeEdge, setFadeEdge] = useState(DEFAULT_FADE);
  const [faces, setFaces] = useState<faceapi.FaceDetection[]>([]);
  const [imageSrc, setImageSrc] = useState("");
  const [canvasSize, setCanvasSize] = useState({ width: 0, height: 0 });

  // Load face-api.js models once on mount
  useEffect(() => {
    let isMounted = true;
    setLoading("Loading face detection models...");
    Promise.all([faceapi.nets.tinyFaceDetector.loadFromUri("/models")])
      .then(() => {
        if (isMounted) setLoading("");
      })
      .catch(() => {
        if (isMounted) setLoading("Failed to load face models.");
      });
    return () => {
      isMounted = false;
    };
  }, []);

  // Detect faces when imageSrc changes
  useEffect(() => {
    if (!imageSrc) return;
    const img = effectiveImageRef.current;
    if (!img) return;

    const runDetection = async () => {
      setLoading("Detecting faces...");
      setFaces([]);
      setResultText("");
      const detections = await faceapi.detectAllFaces(
        img,
        new faceapi.TinyFaceDetectorOptions({
          inputSize: 416,
          scoreThreshold: 0.3,
        })
      );
      setFaces(detections);
      setResultText(`Faces detected: ${detections.length}`);
      setLoading("");
    };

    img.onload = () => {
      setCanvasSize({
        width: img.naturalWidth,
        height: img.naturalHeight,
      });
      void runDetection();
    };
    if (img.complete && img.naturalWidth > 0) {
      setCanvasSize({
        width: img.naturalWidth,
        height: img.naturalHeight,
      });
      void runDetection();
    }
  }, [imageSrc, effectiveImageRef]);

  // Main draw function: draws the original image + all blurred face regions
  const drawAll = useCallback(() => {
    const img = effectiveImageRef.current;
    const canvas = effectiveCanvasRef.current;
    if (!img || !canvas || !imageSrc) return;
    canvas.width = canvasSize.width;
    canvas.height = canvasSize.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

    const { radiusPx, passes } = strengthToBlur(blurStrength);

    faces.forEach((face) => {
      const box = face.box;
      blurRegionFeathered(
        ctx,
        img,
        box.x,
        box.y,
        box.width,
        box.height,
        radiusPx,
        passes,
        fadeEdge
      );
    });
  }, [
    faces,
    blurStrength,
    fadeEdge,
    imageSrc,
    canvasSize,
    effectiveCanvasRef,
    effectiveImageRef,
  ]);

  // Redraw on any change
  useEffect(() => {
    drawAll();
  }, [drawAll]);

  // Helper: feathered/soft mask blurred region (supports multi-pass strength)
  const blurRegionFeathered = (
    ctx: CanvasRenderingContext2D,
    img: HTMLImageElement,
    x: number,
    y: number,
    width: number,
    height: number,
    radiusPx: number,
    passes: number,
    fade: number
  ) => {
    // Clamp box to image bounds
    const sx = Math.max(0, Math.floor(x));
    const sy = Math.max(0, Math.floor(y));
    const sw = Math.min(ctx.canvas.width - sx, Math.ceil(width));
    const sh = Math.min(ctx.canvas.height - sy, Math.ceil(height));
    if (sw <= 0 || sh <= 0) return;

    // 1. Extract region from original (never blur an already blurred canvas)
    const region = document.createElement("canvas");
    region.width = sw;
    region.height = sh;
    const rctx = region.getContext("2d");
    if (!rctx) return;
    rctx.drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh);

    // 2. Multi-pass blur on a double-buffer pair
    const A = document.createElement("canvas");
    const B = document.createElement("canvas");
    A.width = B.width = sw;
    A.height = B.height = sh;
    const a = A.getContext("2d");
    const b = B.getContext("2d");
    if (!a || !b) return;

    // start with original region in A
    a.drawImage(region, 0, 0);
    for (let i = 0; i < passes; i++) {
      b.filter = `blur(${radiusPx}px)`;
      b.drawImage(A, 0, 0); // A -> B blurred
      b.filter = "none";
      // swap A<->B for next pass
      a.clearRect(0, 0, sw, sh);
      a.drawImage(B, 0, 0);
      b.clearRect(0, 0, sw, sh);
    }

    // 3. Build a feathered alpha mask (radial gradient)
    const mask = document.createElement("canvas");
    mask.width = sw;
    mask.height = sh;
    const mctx = mask.getContext("2d");
    if (!mctx) return;
    const cx = sw / 2;
    const cy = sh / 2;
    const rx = sw / 2;
    const ry = sh / 2;
    const grad = mctx.createRadialGradient(
      cx,
      cy,
      Math.max(0, Math.min(rx, ry) - fade),
      cx,
      cy,
      Math.max(rx, ry)
    );
    grad.addColorStop(0, "rgba(0,0,0,1)");
    grad.addColorStop(1, "rgba(0,0,0,0)");
    mctx.fillStyle = grad;
    mctx.fillRect(0, 0, sw, sh);

    // 4. Composite: apply mask to blurred output, then draw back
    const comp = document.createElement("canvas");
    comp.width = sw;
    comp.height = sh;
    const cctx = comp.getContext("2d");
    if (!cctx) return;
    cctx.drawImage(A, 0, 0); // final blurred image is in A
    cctx.globalCompositeOperation = "destination-in";
    cctx.drawImage(mask, 0, 0);
    cctx.globalCompositeOperation = "source-over";

    ctx.drawImage(comp, sx, sy);
  };

  // File upload handler
  const handleFileChange = useCallback((e: ChangeEvent<HTMLInputElement>) => {
    setFaces([]);
    setResultText("");
    if (!e.target.files?.length) return;
    const file = e.target.files[0];
    if (!file) return;
    setLoading("Loading image...");
    const reader = new window.FileReader();
    reader.onload = (ev) => {
      setImageSrc(ev.target?.result as string);
      setLoading("");
    };
    reader.onerror = () => {
      setLoading("Error loading image.");
    };
    reader.readAsDataURL(file);
  }, []);

  // Blur strength slider (0–100)
  const handleBlurChange = useCallback((e: ChangeEvent<HTMLInputElement>) => {
    setBlurStrength(Number(e.target.value));
  }, []);

  // Edge fade slider
  const handleFadeChange = useCallback((e: ChangeEvent<HTMLInputElement>) => {
    setFadeEdge(Number(e.target.value));
  }, []);

  return (
    <div className="container my-4">
      <div className="mb-3">
        <label htmlFor="face-image-upload" className="form-label">
          Select image:
        </label>
        <input
          id="face-image-upload"
          type="file"
          accept="image/*"
          onChange={handleFileChange}
          aria-label="Select image file"
          className="form-control"
        />
      </div>
      {imageRef ? (
        <>
          <p>Img Source {imageSrc}</p>
          <div className="mb-3">
            <label htmlFor="face-blur-slider" className="form-label">
              Blur Strength:
            </label>
            <input
              id="face-blur-slider"
              type="range"
              min={0}
              max={100}
              step={1}
              value={blurStrength}
              onChange={handleBlurChange}
              className="form-range"
            />
            <span className="ms-2">{blurStrength}</span>
          </div>
          <div className="mb-3">
            <label htmlFor="face-fade-slider" className="form-label">
              Edge Fade:
            </label>
            <input
              id="face-fade-slider"
              type="range"
              min={0}
              max={60}
              step={2}
              value={fadeEdge}
              onChange={handleFadeChange}
              className="form-range"
            />
            <span className="ms-2">{fadeEdge}px</span>
          </div>
        </>
      ) : null}
      <div className="mb-3">
        {loading && <span className="text-danger">{loading}</span>}
        {resultText && <span>{resultText}</span>}
      </div>
      {/* Hidden image element for face-api.js */}
      {imageSrc ? (
        <>
          <img
            ref={effectiveImageRef}
            src={imageSrc}
            alt="image-topic"
            style={{ display: "none" }}
            crossOrigin="anonymous"
          />

          <div className="mb-3">
            <canvas
              ref={effectiveCanvasRef}
              className="border border-dark w-100"
              style={{
                maxWidth: "100%",
                background: "#40484fff",
                borderRadius: "8px",
              }}
              aria-label="Processed image with blurred license plate"
            />
          </div>
        </>
      ) : null}
    </div>
  );
};

export default FaceBlur;
