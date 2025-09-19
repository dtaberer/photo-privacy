import React from "react";
import { act, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Canvas, { type CanvasHandle } from "@/components/Canvas";

const onChangeMock = vi.fn<(value: string) => void>();

type Ctx = ReturnType<typeof createMockContext>;
const ctxMap = new Map<HTMLCanvasElement, Ctx>();

function createMockContext(canvas: HTMLCanvasElement) {
  const data = new Uint8ClampedArray(canvas.width * canvas.height * 4);
  let gco = "source-over";
  let filter = "none";
  return {
    canvas,
    clearRect: vi.fn(),
    drawImage: vi.fn(),
    fillRect: vi.fn(),
    beginPath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    stroke: vi.fn(),
    closePath: vi.fn(),
    save: vi.fn(),
    restore: vi.fn(),
    setTransform: vi.fn(),
    setLineDash: vi.fn(),
    createLinearGradient: () => ({ addColorStop: vi.fn() }),
    createRadialGradient: () => ({ addColorStop: vi.fn() }),
    getImageData: vi.fn(() => ({
      data,
      width: canvas.width,
      height: canvas.height,
    })),
    putImageData: vi.fn(),
    toDataURL: vi.fn(() => "data:image/png;base64,export"),
    get globalCompositeOperation() {
      return gco;
    },
    set globalCompositeOperation(value: string) {
      gco = value;
    },
    get filter() {
      return filter;
    },
    set filter(value: string) {
      filter = value;
    },
    lineCap: "round",
    lineJoin: "round",
    lineWidth: 1,
    strokeStyle: "#000",
    fillStyle: "#000",
  };
}

let originalGetContext: typeof HTMLCanvasElement.prototype.getContext;
let originalImage: typeof Image;
let originalPointerEvent: typeof PointerEvent | undefined;
let originalSetPointerCapture: (this: Element, pointerId: number) => void;
let originalReleasePointerCapture: (this: Element, pointerId: number) => void;
let originalToDataURL: typeof HTMLCanvasElement.prototype.toDataURL;

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  ctxMap.clear();
  originalGetContext = HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext = function (
    this: HTMLCanvasElement,
    contextId: any,
    _options?: any
  ) {
    // Only intercept 2d contexts; defer all other context ids to original implementation preserving overload expectations.
    if (contextId !== "2d") {
      return originalGetContext.call(this, contextId as never, _options);
    }
    if (!ctxMap.has(this)) {
      ctxMap.set(this, createMockContext(this));
    }
    return ctxMap.get(this) as unknown as CanvasRenderingContext2D;
  } as unknown as typeof HTMLCanvasElement.prototype.getContext;
  originalToDataURL = HTMLCanvasElement.prototype.toDataURL;
  HTMLCanvasElement.prototype.toDataURL = vi.fn(
    () => "data:image/png;base64,export"
  );
  originalImage = globalThis.Image;
  (globalThis as unknown as { Image: typeof Image }).Image = class {
    onload: (() => void) | null = null;
    onerror: (() => void) | null = null;
    width = 100;
    height = 60;
    naturalWidth = 100;
    naturalHeight = 60;
    set src(_value: string) {
      queueMicrotask(() => this.onload?.());
    }
  } as unknown as typeof Image;
  originalSetPointerCapture = HTMLCanvasElement.prototype.setPointerCapture;
  originalReleasePointerCapture =
    HTMLCanvasElement.prototype.releasePointerCapture;
  HTMLCanvasElement.prototype.setPointerCapture = vi.fn();
  HTMLCanvasElement.prototype.releasePointerCapture = vi.fn();
  if (!(globalThis as Record<string, unknown>).PointerEvent) {
    originalPointerEvent = undefined;
    class PointerEventPolyfill extends MouseEvent {
      pointerId: number;
      constructor(type: string, init: MouseEventInit & { pointerId?: number }) {
        super(type, init);
        this.pointerId = init.pointerId ?? 1;
      }
    }
    (
      globalThis as unknown as { PointerEvent: typeof PointerEvent }
    ).PointerEvent = PointerEventPolyfill as unknown as typeof PointerEvent;
  } else {
    originalPointerEvent = PointerEvent;
  }
});

afterEach(() => {
  HTMLCanvasElement.prototype.getContext = originalGetContext;
  HTMLCanvasElement.prototype.toDataURL = originalToDataURL;
  globalThis.Image = originalImage;
  HTMLCanvasElement.prototype.setPointerCapture = originalSetPointerCapture;
  HTMLCanvasElement.prototype.releasePointerCapture =
    originalReleasePointerCapture;
  if (!originalPointerEvent) {
    delete (globalThis as Record<string, unknown>).PointerEvent;
  } else {
    (
      globalThis as unknown as { PointerEvent: typeof PointerEvent }
    ).PointerEvent = originalPointerEvent;
  }
  onChangeMock.mockReset();
  ctxMap.clear();
});

function getContexts(container: HTMLElement) {
  const canvases = container.querySelectorAll("canvas");
  const imageCanvas = canvases[0] as HTMLCanvasElement;
  const maskCanvas = canvases[1] as HTMLCanvasElement;
  const imageCtx = ctxMap.get(imageCanvas)!;
  const maskCtx = ctxMap.get(maskCanvas)!;
  return { imageCanvas, maskCanvas, imageCtx, maskCtx };
}

describe("Canvas component", () => {
  it("exposes drawing and export helpers", async () => {
    const handleRef = React.createRef<CanvasHandle>();

    const { container } = render(
      <Canvas
        ref={handleRef}
        width={200}
        height={150}
        image={null}
        brushSize={12}
        brushColor="rgba(255,0,0,0.6)"
        mode="paint"
        showGrid
        onChange={onChangeMock}
      />
    );

    const { imageCtx, maskCtx, maskCanvas } = getContexts(container);
    maskCanvas.getBoundingClientRect = () => ({
      left: 0,
      top: 0,
      right: 200,
      bottom: 150,
      width: 200,
      height: 150,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    });
    maskCanvas.toDataURL = vi.fn(() => "data:image/png;base64,mask");

    await act(async () => {
      await handleRef.current?.loadImage("https://example.com/photo.jpg");
    });
    expect(imageCtx.drawImage).toHaveBeenCalled();

    act(() => {
      handleRef.current?.fillMaskRects(
        [{ x: 5, y: 6, w: 10, h: 12 }],
        "rgba(0,0,0,1)"
      );
    });
    expect(maskCtx.fillRect).toHaveBeenCalledWith(5, 6, 10, 12);
    expect(onChangeMock).toHaveBeenCalled();

    act(() => {
      handleRef.current?.clearMask();
    });
    expect(maskCtx.clearRect).toHaveBeenCalled();

    const exported = handleRef.current?.exportImage();
    expect(exported).toMatch(/^data:image\/png;base64/);

    const maskUrl = handleRef.current?.getMaskDataURL();
    expect(maskUrl).toBe("data:image/png;base64,mask");

    const pointerDown = new PointerEvent("pointerdown", {
      clientX: 20,
      clientY: 25,
      pointerId: 1,
      bubbles: true,
    });
    maskCanvas.dispatchEvent(pointerDown);
    const pointerMove = new PointerEvent("pointermove", {
      clientX: 40,
      clientY: 45,
      pointerId: 1,
      bubbles: true,
    });
    maskCanvas.dispatchEvent(pointerMove);
    const pointerUp = new PointerEvent("pointerup", {
      clientX: 40,
      clientY: 45,
      pointerId: 1,
      bubbles: true,
    });
    window.dispatchEvent(pointerMove);
    window.dispatchEvent(pointerUp);

    expect(maskCtx.beginPath).toHaveBeenCalled();
    expect(maskCtx.stroke).toHaveBeenCalled();
    expect(onChangeMock).toHaveBeenCalledTimes(3);
  });
});
