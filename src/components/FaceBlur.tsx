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

const DEFAULT_BLUR = 20;
const DEFAULT_FADE = 40;

export const FaceBlur: FC<FaceBlurProps> = ({ imageRef, canvasRef }) => {
  // Internal refs if not provided
  const internalImageRef = useRef<HTMLImageElement>(null);
  const internalCanvasRef = useRef<HTMLCanvasElement>(null);

  const effectiveImageRef = imageRef ?? internalImageRef;
  const effectiveCanvasRef = canvasRef ?? internalCanvasRef;

  const [loading, setLoading] = useState("");
  const [resultText, setResultText] = useState("");
  const [blurStrength, setBlurStrength] = useState(DEFAULT_BLUR);
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

    faces.forEach((face) => {
      const box = face.box;
      blurRegionFeathered(
        ctx,
        img,
        box.x,
        box.y,
        box.width,
        box.height,
        blurStrength,
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

  // Helper: feathered/soft mask blurred region
  const blurRegionFeathered = (
    ctx: CanvasRenderingContext2D,
    img: HTMLImageElement,
    x: number,
    y: number,
    width: number,
    height: number,
    blurAmount: number,
    fade: number
  ) => {
    // Clamp box to image bounds
    const sx = Math.max(0, Math.floor(x));
    const sy = Math.max(0, Math.floor(y));
    const sw = Math.min(ctx.canvas.width - sx, Math.ceil(width));
    const sh = Math.min(ctx.canvas.height - sy, Math.ceil(height));
    if (sw <= 0 || sh <= 0) return;

    // 1. Get face region from original image (not already-blurred canvas!)
    const faceRegion = document.createElement("canvas");
    faceRegion.width = sw;
    faceRegion.height = sh;
    const faceCtx = faceRegion.getContext("2d");
    if (!faceCtx) return;
    faceCtx.drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh);

    // 2. Blur that region on another canvas
    const blurredFace = document.createElement("canvas");
    blurredFace.width = sw;
    blurredFace.height = sh;
    const blurredCtx = blurredFace.getContext("2d");
    if (!blurredCtx) return;
    blurredCtx.filter = `blur(${blurAmount}px)`;
    blurredCtx.drawImage(faceRegion, 0, 0);

    // 3. Create an alpha mask with a radial gradient (ellipse)
    const maskCanvas = document.createElement("canvas");
    maskCanvas.width = sw;
    maskCanvas.height = sh;
    const maskCtx = maskCanvas.getContext("2d");
    if (!maskCtx) return;
    const centerX = sw / 2;
    const centerY = sh / 2;
    const radiusX = sw / 2;
    const radiusY = sh / 2;
    const grad = maskCtx.createRadialGradient(
      centerX,
      centerY,
      Math.max(0, Math.min(radiusX, radiusY) - fade),
      centerX,
      centerY,
      Math.max(radiusX, radiusY)
    );
    grad.addColorStop(0, "rgba(0,0,0,1)");
    grad.addColorStop(1, "rgba(0,0,0,0)");
    maskCtx.fillStyle = grad;
    maskCtx.fillRect(0, 0, sw, sh);

    // 4. Compose: draw blurred region with mask as alpha onto main canvas
    // - Create an offscreen canvas for compositing
    const composite = document.createElement("canvas");
    composite.width = sw;
    composite.height = sh;
    const compositeCtx = composite.getContext("2d");
    if (!compositeCtx) return;
    // Draw blurred face
    compositeCtx.drawImage(blurredFace, 0, 0);
    // Set destination-in to apply the alpha mask
    compositeCtx.globalCompositeOperation = "destination-in";
    compositeCtx.drawImage(maskCanvas, 0, 0);

    // Draw the composite back to main canvas at the right spot
    ctx.drawImage(composite, sx, sy);
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

  // Blur slider
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
              min={4}
              max={64}
              step={2}
              value={blurStrength}
              onChange={handleBlurChange}
              className="form-range"
            />
            <span className="ms-2">{blurStrength}px</span>
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
