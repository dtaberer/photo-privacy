import React, {
  useRef, useEffect, useCallback, useImperativeHandle, forwardRef
} from "react";
import Canvas, { type CanvasHandle } from "./Canvas";

export type NatBox = { x: number; y: number; w: number; h: number };

export type PlateRedactorHandle = {
  /** Prefill mask from natural-image boxes; component figures out natural size from its imageURL */
  prefillFromDetections: (boxes: NatBox[]) => Promise<void>;
  /** Export the current composited result as PNG data URL */
  exportResult: () => string | null;
};

type Props = {
  imageURL: string;   // source image to redact
  blurVal: number;    // 0..100 (you already have plateBlur)
  width?: number;     // display size (CSS)
  height?: number;
};

export const PlateRedactor = forwardRef<PlateRedactorHandle, Props>(function PlateRedactor(
  { imageURL, blurVal, width = 900, height = 600 },
  ref
) {
  const maskRef = useRef<CanvasHandle>(null);
  const outRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (imageURL) maskRef.current?.loadImage(imageURL);
  }, [imageURL]);

  const loadImg = (url: string) =>
    new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = url;
    });

  // letterbox mapping (same logic your Canvas uses to fit the image)
  function mapBoxToCanvas(
    b: NatBox, naturalW: number, naturalH: number, canvasW: number, canvasH: number
  ) {
    const canvasRatio = canvasW / canvasH;
    const imgRatio = naturalW / naturalH;
    let drawW: number, drawH: number, offsetX = 0, offsetY = 0, scale: number;

    if (imgRatio > canvasRatio) {
      drawW = canvasW;
      drawH = canvasW / imgRatio;
      offsetY = (canvasH - drawH) / 2;
      scale = drawW / naturalW;
    } else {
      drawH = canvasH;
      drawW = canvasH * imgRatio;
      offsetX = (canvasW - drawW) / 2;
      scale = drawH / naturalH;
    }

    return {
      x: offsetX + b.x * scale,
      y: offsetY + b.y * scale,
      w: b.w * scale,
      h: b.h * scale,
    };
  }

  const compose = useCallback(async () => {
    if (!outRef.current || !imageURL) return;
    const maskUrl = maskRef.current?.getMaskDataURL();
    if (!maskUrl) return;

    const [maskImg, baseImg] = await Promise.all([loadImg(maskUrl), loadImg(imageURL)]);
    const W = maskImg.width, H = maskImg.height;

    const out = outRef.current;
    out.width = W; out.height = H;
    const ctx = out.getContext("2d"); if (!ctx) return;

    // 1) base image
    ctx.clearRect(0, 0, W, H);
    ctx.globalCompositeOperation = "source-over";
    ctx.drawImage(baseImg, 0, 0, W, H);

    // 2) blurred base on offscreen
    const off = document.createElement("canvas");
    off.width = W; off.height = H;
    const octx = off.getContext("2d")!;
    const px = Math.max(1, Math.round((blurVal / 100) * 40)); // 0..100 → 1..40px
    octx.filter = `blur(${px}px)`;
    octx.drawImage(baseImg, 0, 0, W, H);
    octx.filter = "none";

    // 3) keep only masked region
    octx.globalCompositeOperation = "destination-in";
    octx.drawImage(maskImg, 0, 0, W, H);
    octx.globalCompositeOperation = "source-over";

    // 4) draw blurred patch back
    ctx.drawImage(off, 0, 0);
  }, [imageURL, blurVal]);

  // Recompose on mask paint and blur changes
  const onMaskChange = useCallback(() => { void compose(); }, [compose]);
  useEffect(() => { void compose(); }, [compose]);

  useImperativeHandle(ref, (): PlateRedactorHandle => ({
    prefillFromDetections: async (boxes) => {
      if (!imageURL) return;
      const img = await loadImg(imageURL);
      const rects = boxes.map(b =>
        mapBoxToCanvas(b, img.naturalWidth, img.naturalHeight, width, height)
      );
      maskRef.current?.fillMaskRects(rects, "rgba(0,0,0,1)"); // opaque mask
      await compose();
    },
    exportResult: () => outRef.current?.toDataURL("image/png") ?? null,
  }));

  return (
    <div className="plate-redactor">
      <Canvas
        ref={maskRef}
        width={width}
        height={height}
        image={imageURL || null}
        brushSize={30}
        brushColor="rgba(0,0,0,1)"
        mode="paint"
        onChange={onMaskChange}
      />
      <canvas ref={outRef} className="canvas-output" style={{ width, height }} />
    </div>
  );
});

export default PlateRedactor;
