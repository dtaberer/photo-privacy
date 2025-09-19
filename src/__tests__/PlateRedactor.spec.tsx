import React from "react";
import { act, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CanvasHandle } from "@/components/Canvas";
import PlateRedactor, {
  type PlateRedactorHandle,
} from "@/components/PlateRedactor";

const loadImageMock = vi.fn();
const fillMaskRectsMock = vi.fn();
const getMaskDataURLMock = vi.fn(() => "data:image/png;base64,mask");
const clearMaskMock = vi.fn();
const exportImageMock = vi.fn(() => "data:image/png;base64,mask");

const canvasHandle: CanvasHandle = {
  loadImage: loadImageMock,
  fillMaskRects: fillMaskRectsMock,
  clearMask: clearMaskMock,
  exportImage: exportImageMock,
  getMaskDataURL: getMaskDataURLMock,
};

interface MockCanvasProps {
  onChange?: (value: string) => void;
}
vi.mock("@/components/Canvas", () => ({
  __esModule: true,
  default: React.forwardRef<CanvasHandle, MockCanvasProps>((props, ref) => {
    React.useImperativeHandle(ref, () => canvasHandle);
    props.onChange?.("data:image/png;base64,mask");
    return <div data-testid="mock-canvas" />;
  }),
}));

const ctxMock = {
  clearRect: vi.fn(),
  drawImage: vi.fn(),
  globalCompositeOperation: "source-over",
  filter: "none",
  getContext: vi.fn(),
  getImageData: vi.fn(),
  canvas: document.createElement("canvas"),
};

let originalGetContext: typeof HTMLCanvasElement.prototype.getContext;
let originalImage: typeof Image;

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  originalGetContext = HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext = function (
    this: HTMLCanvasElement,
    contextId: unknown,
    _options?: unknown
  ) {
    if (contextId !== "2d") {
      return originalGetContext.call(
        this,
        contextId as never,
        _options as never
      );
    }
    return ctxMock as unknown as CanvasRenderingContext2D;
  } as unknown as typeof HTMLCanvasElement.prototype.getContext;
  originalImage = globalThis.Image;
  (globalThis as unknown as { Image: typeof Image }).Image = class {
    onload: (() => void) | null = null;
    onerror: (() => void) | null = null;
    width = 200;
    height = 120;
    naturalWidth = 200;
    naturalHeight = 120;
    set src(_value: string) {
      queueMicrotask(() => this.onload?.());
    }
  } as unknown as typeof Image;
});

afterEach(() => {
  HTMLCanvasElement.prototype.getContext = originalGetContext;
  globalThis.Image = originalImage;
});

describe("PlateRedactor", () => {
  it("prefills detections and exports composed result", async () => {
    const handleRef = React.createRef<PlateRedactorHandle>();

    const { container } = render(
      <PlateRedactor
        imageURL="https://example.com/photo.png"
        blurVal={60}
        ref={handleRef}
      />
    );

    await act(async () => {
      await handleRef.current?.prefillFromDetections([
        { x: 10, y: 20, w: 40, h: 30 },
      ]);
    });

    expect(loadImageMock).toHaveBeenCalledWith("https://example.com/photo.png");
    expect(fillMaskRectsMock).toHaveBeenCalled();

    const lastCall = fillMaskRectsMock.mock.calls.slice(-1)[0];
    const rects = lastCall?.[0];
    const mapped = rects[0]!;
    expect(mapped.x).toBeGreaterThan(0);
    expect(mapped.y).toBeGreaterThan(0);

    const outCanvas = container.querySelector("canvas")!;
    outCanvas.toDataURL = vi.fn(() => "data:image/png;base64,result");

    const exported = handleRef.current?.exportResult();
    expect(exported).toBe("data:image/png;base64,result");

    expect(ctxMock.drawImage).toHaveBeenCalled();
  });
});
