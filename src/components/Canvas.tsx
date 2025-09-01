import React, {

useRef,
useEffect,
useState,
useCallback,
forwardRef,
useImperativeHandle,
} from "react";

export type Rect = { x: number; y: number; w: number; h: number };
type Mode = "paint" | "erase";

export type CanvasHandle = {
fillMaskRects: (rects: {x:number;y:number;w:number;h:number}[], color?: string) => void;
exportImage: (includeMask?: boolean) => string | null;
clearMask: () => void;
loadImage: (src: string) => Promise<void>;
getMaskDataURL: () => string | null;
};

export type CanvasProps = {
width?: number; // logical CSS width
height?: number; // logical CSS height
image?: string | null;
brushSize?: number;
brushColor?: string;
mode?: Mode;
showGrid?: boolean;
pixelRatio?: number; // optional override for devicePixelRatio
onChange?: (imageDataUrl: string) => void;
};

const DEFAULT_WIDTH = 800;
const DEFAULT_HEIGHT = 600;
const DEFAULT_BRUSH = 30;

const Canvas = forwardRef<CanvasHandle, CanvasProps>((props, ref) => {
const {
    width = DEFAULT_WIDTH,
    height = DEFAULT_HEIGHT,
    image = null,
    brushSize = DEFAULT_BRUSH,
    brushColor = "rgba(0,0,0,0.6)",
    mode = "paint",
    showGrid = false,
    pixelRatio,
    onChange,
} = props;

const containerRef = useRef<HTMLDivElement | null>(null);
const imageCanvasRef = useRef<HTMLCanvasElement | null>(null);
const maskCanvasRef = useRef<HTMLCanvasElement | null>(null);

const imageRef = useRef<HTMLImageElement | null>(null);
const drawing = useRef(false);
const lastPoint = useRef<{ x: number; y: number } | null>(null);
const dpr = (pixelRatio && pixelRatio > 0) ? pixelRatio : window.devicePixelRatio || 1;

const [loadedSrc, setLoadedSrc] = useState<string | null>(image);

// Expose imperative methods
useImperativeHandle(
    ref,
    (): CanvasHandle => ({
        fillMaskRects: (rects: {x:number;y:number;w:number;h:number}[], color = "rgba(0,0,0,1)") => {
            const mask = maskCanvasRef.current; if (!mask) return;
            const ctx = mask.getContext("2d"); if (!ctx) return;
            ctx.save();
            ctx.globalCompositeOperation = "source-over";
            ctx.fillStyle = color;
            rects.forEach(r => ctx.fillRect(r.x, r.y, r.w, r.h));
            ctx.restore();
            onChange?.(getMaskDataURL() || "");
        },
        exportImage: (includeMask = true) => {
            const imageCanvas = imageCanvasRef.current;
            const maskCanvas = maskCanvasRef.current;
            if (!imageCanvas) return null;

            // Create temp canvas to combine
            const out = document.createElement("canvas");
            out.width = imageCanvas.width;
            out.height = imageCanvas.height;
            const ctx = out.getContext("2d");
            if (!ctx) return null;

            ctx.drawImage(imageCanvas, 0, 0);
            if (includeMask && maskCanvas) {
                // Draw mask over image using globalAlpha or composite - here we multiply to darken masked areas
                ctx.drawImage(maskCanvas, 0, 0);
            }
            return out.toDataURL("image/png");
        },

        clearMask: () => {
            const mask = maskCanvasRef.current;
            if (!mask) return;
            const ctx = mask.getContext("2d");
            if (!ctx) return;
            ctx.clearRect(0, 0, mask.width, mask.height);
            if (onChange) onChange(getMaskDataURL() || "");
        },

        loadImage: async (src: string) => {
            await loadAndDrawImage(src);
            setLoadedSrc(src);
        },

        getMaskDataURL: () => {
            return getMaskDataURL();
        },
    })
);

// Helper to get mask dataURL
const getMaskDataURL = useCallback((): string | null => {
    const mask = maskCanvasRef.current;
    if (!mask) return null;
    return mask.toDataURL("image/png");
}, []);

// Initialize canvas sizes with DPR scaling
useEffect(() => {
    const imageCanvas = imageCanvasRef.current;
    const maskCanvas = maskCanvasRef.current;
    if (!imageCanvas || !maskCanvas) return;

    const w = Math.max(1, Math.floor(width));
    const h = Math.max(1, Math.floor(height));
    imageCanvas.style.width = `${w}px`;
    imageCanvas.style.height = `${h}px`;
    maskCanvas.style.width = `${w}px`;
    maskCanvas.style.height = `${h}px`;

    imageCanvas.width = Math.floor(w * dpr);
    imageCanvas.height = Math.floor(h * dpr);
    maskCanvas.width = Math.floor(w * dpr);
    maskCanvas.height = Math.floor(h * dpr);

    // scale contexts
    const imgCtx = imageCanvas.getContext("2d");
    const maskCtx = maskCanvas.getContext("2d");
    if (imgCtx) {
        imgCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
        imgCtx.clearRect(0, 0, w, h);
    }
    if (maskCtx) {
        maskCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
        maskCtx.clearRect(0, 0, w, h);
    }
}, [width, height, dpr]);

// Load and draw image onto imageCanvas
const loadAndDrawImage = useCallback(
    (src: string | null) =>
        new Promise<void>((resolve) => {
            const imageCanvas = imageCanvasRef.current;
            if (!imageCanvas) {
                resolve();
                return;
            }
            const ctx = imageCanvas.getContext("2d");
            if (!ctx) {
                resolve();
                return;
            }
            if (!src) {
                ctx.clearRect(0, 0, width, height);
                resolve();
                return;
            }

            const img = new Image();
            imageRef.current = img;
            img.crossOrigin = "anonymous";
            img.onload = () => {
                // Fit image into canvas area preserving aspect ratio and center it.
                ctx.clearRect(0, 0, width, height);
                const canvasRatio = width / height;
                const imgRatio = img.width / img.height;
                let drawW = width;
                let drawH = height;
                let offsetX = 0;
                let offsetY = 0;
                if (imgRatio > canvasRatio) {
                    // image is wider
                    drawW = width;
                    drawH = width / imgRatio;
                    offsetY = (height - drawH) / 2;
                } else {
                    drawH = height;
                    drawW = height * imgRatio;
                    offsetX = (width - drawW) / 2;
                }
                ctx.drawImage(img, offsetX, offsetY, drawW, drawH);
                resolve();
            };
            img.onerror = () => {
                // clear on error
                ctx.clearRect(0, 0, width, height);
                resolve();
            };
            img.src = src;
        }),
    [width, height]
);

// initial load when image prop changes
useEffect(() => {
    setLoadedSrc(image);
    loadAndDrawImage(image).then(() => {
        // no-op
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
}, [image]);

// Drawing utilities
const getPointerPos = useCallback(
    (evt: PointerEvent | React.PointerEvent): { x: number; y: number } => {
        const rect = maskCanvasRef.current?.getBoundingClientRect();
        const clientX = (evt as PointerEvent).clientX ?? (evt as any).touches?.[0]?.clientX ?? 0;
        const clientY = (evt as PointerEvent).clientY ?? (evt as any).touches?.[0]?.clientY ?? 0;
        if (!rect) return { x: clientX, y: clientY };
        // map CSS coords to canvas logical (we already scaled contexts by dpr)
        const x = (clientX - rect.left) * (maskCanvasRef.current!.width / rect.width) / dpr;
        const y = (clientY - rect.top) * (maskCanvasRef.current!.height / rect.height) / dpr;
        return { x, y };
    },
    [dpr]
);

const drawLine = useCallback(
    (from: { x: number; y: number } | null, to: { x: number; y: number }) => {
        const mask = maskCanvasRef.current;
        if (!mask) return;
        const ctx = mask.getContext("2d");
        if (!ctx) return;

        ctx.lineCap = "round";
        ctx.lineJoin = "round";
        ctx.lineWidth = brushSize;
        if (mode === "paint") {
            // paint uses a semi-transparent color, leaving visible overlay for masked areas
            ctx.globalCompositeOperation = "source-over";
            ctx.strokeStyle = brushColor;
        } else {
            // erase: clear mask
            ctx.globalCompositeOperation = "destination-out";
            ctx.strokeStyle = "rgba(0,0,0,1)";
        }

        ctx.beginPath();
        if (from) {
            ctx.moveTo(from.x, from.y);
        } else {
            ctx.moveTo(to.x - 0.01, to.y);
        }
        ctx.lineTo(to.x, to.y);
        ctx.stroke();
        ctx.closePath();
    },
    [brushSize, brushColor, mode]
);

// Pointer event handlers
useEffect(() => {
    const mask = maskCanvasRef.current;
    if (!mask) return;

    const handlePointerDown = (e: PointerEvent) => {
        (mask as HTMLElement).setPointerCapture((e as any).pointerId);
        drawing.current = true;
        lastPoint.current = getPointerPos(e);
        drawLine(null, lastPoint.current);
    };

    const handlePointerMove = (e: PointerEvent) => {
        if (!drawing.current) return;
        const pos = getPointerPos(e);
        drawLine(lastPoint.current, pos);
        lastPoint.current = pos;
    };

    const handlePointerUp = (e: PointerEvent) => {
        if (drawing.current) {
            drawing.current = false;
            lastPoint.current = null;
            if (onChange) {
                const out = exportMaskAndImage(false);
                if (out) onChange(out);
            }
        }
        try {
            (mask as HTMLElement).releasePointerCapture((e as any).pointerId);
        } catch {
            // ignore
        }
    };

    mask.addEventListener("pointerdown", handlePointerDown);
    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);

    return () => {
        mask.removeEventListener("pointerdown", handlePointerDown);
        window.removeEventListener("pointermove", handlePointerMove);
        window.removeEventListener("pointerup", handlePointerUp);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
}, [drawLine, getPointerPos, onChange]);

// helper to export combined image as dataURL (optionally only mask)
const exportMaskAndImage = useCallback(
    (onlyMask = false): string | null => {
        const imageCanvas = imageCanvasRef.current;
        const maskCanvas = maskCanvasRef.current;
        if (!imageCanvas) return null;
        if (onlyMask && maskCanvas) return maskCanvas.toDataURL("image/png");

        const out = document.createElement("canvas");
        out.width = imageCanvas.width;
        out.height = imageCanvas.height;
        const ctx = out.getContext("2d");
        if (!ctx) return null;
        ctx.drawImage(imageCanvas, 0, 0);
        if (maskCanvas) ctx.drawImage(maskCanvas, 0, 0);
        return out.toDataURL("image/png");
    },
    []
);

// optional grid overlay rendering on mask canvas
useEffect(() => {
    if (!showGrid) return;
    const mask = maskCanvasRef.current;
    if (!mask) return;
    const ctx = mask.getContext("2d");
    if (!ctx) return;

    const renderGrid = () => {
        const w = width;
        const h = height;
        ctx.save();
        // draw grid lightly on top
        ctx.setLineDash([4, 4]);
        ctx.globalCompositeOperation = "source-over";
        ctx.strokeStyle = "rgba(255,255,255,0.15)";
        ctx.lineWidth = 1;
        const step = Math.max(10, Math.floor(Math.min(width, height) / 20));
        for (let x = step; x < w; x += step) {
            ctx.beginPath();
            ctx.moveTo(x, 0);
            ctx.lineTo(x, h);
            ctx.stroke();
        }
        for (let y = step; y < h; y += step) {
            ctx.beginPath();
            ctx.moveTo(0, y);
            ctx.lineTo(w, y);
            ctx.stroke();
        }
        ctx.restore();
    };

    renderGrid();
    // We intentionally don't clear grid on mask clear.
    // eslint-disable-next-line react-hooks/exhaustive-deps
}, [showGrid, width, height]);

// Basic styling inlined to avoid external CSS file
const containerStyle: React.CSSProperties = {
    position: "relative",
    width: `${width}px`,
    height: `${height}px`,
    userSelect: "none",
    touchAction: "none",
};

const canvasStyle: React.CSSProperties = {
    position: "absolute",
    left: 0,
    top: 0,
    display: "block",
};

return (
    <div ref={containerRef} style={containerStyle}>
        <canvas
            ref={imageCanvasRef}
            width={Math.max(1, Math.floor(width * dpr))}
            height={Math.max(1, Math.floor(height * dpr))}
            style={canvasStyle}
        />
        <canvas
            ref={maskCanvasRef}
            width={Math.max(1, Math.floor(width * dpr))}
            height={Math.max(1, Math.floor(height * dpr))}
            style={canvasStyle}
        />
    </div>
);
});

Canvas.displayName = "Canvas";

export default Canvas;