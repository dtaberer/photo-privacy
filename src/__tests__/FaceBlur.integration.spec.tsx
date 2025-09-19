import React from "react";
import { act, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type FaceBlurComponent from "@/components/FaceBlur";
import type { BlurHandler, PerformanceReport } from "@/types/detector-types";

type FaceBlurProps = React.ComponentProps<typeof FaceBlurComponent>;

const blurPatchMock = vi.fn();
const loadFaceModel = vi.fn();
const detectFaces = vi.fn();

vi.mock("@/components/utils/face-blur-utils", async () => {
  const actual = await vi.importActual<
    typeof import("@/components/utils/face-blur-utils")
  >("@/components/utils/face-blur-utils");
  return {
    ...actual,
    blurPatchWithFeather: blurPatchMock,
  };
});

vi.mock("@/components/utils/face-detector-onnx", () => ({
  __esModule: true,
  loadFaceModel,
  detectFaces,
  decodeYoloOutput: vi.fn(),
}));

describe("FaceBlur component (real implementation)", () => {
  let originalRAF: typeof requestAnimationFrame;

  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    originalRAF = window.requestAnimationFrame;
    window.requestAnimationFrame = ((cb: FrameRequestCallback) => {
      cb(performance.now());
      return 1;
    }) as typeof requestAnimationFrame;
    delete (window as { FaceDetector?: unknown }).FaceDetector;
  });

  afterEach(() => {
    window.requestAnimationFrame = originalRAF;
  });

  it("runs ONNX detection path, redraws, and exposes imperative API", async () => {
    loadFaceModel.mockResolvedValueOnce(undefined);
    detectFaces.mockResolvedValueOnce([
      { x: 10, y: 20, w: 40, h: 50, score: 0.95 },
      { x: 120, y: 60, w: 30, h: 20, score: 0.4 },
    ]);

    const img = document.createElement("img");
    Object.defineProperty(img, "complete", { value: true });
    Object.defineProperty(img, "naturalWidth", { value: 400 });
    Object.defineProperty(img, "naturalHeight", { value: 300 });

    const canvas = document.createElement("canvas");
    canvas.width = 800;
    canvas.height = 600;

    const imgRef = { current: img } as React.RefObject<HTMLImageElement>;
    const canvasRef = { current: canvas } as React.RefObject<HTMLCanvasElement>;
    const setPerfReport: React.Dispatch<
      React.SetStateAction<PerformanceReport>
    > = vi.fn();

    const opts: FaceBlurProps["opts"] = {
      modelSize: 416,
      confThresh: 0.6,
      blurStrength: 30,
      featherPx: 5,
      setPerfReport,
    };

    const { default: FaceBlur } = await vi.importActual<
      typeof import("@/components/FaceBlur")
    >("@/components/FaceBlur");

    const handleRef = React.createRef<BlurHandler>();
    render(
      <FaceBlur
        ref={handleRef}
        imgRef={imgRef}
        canvasRef={canvasRef}
        opts={opts}
      />
    );

    expect(handleRef.current).toBeDefined();

    await act(async () => {
      await handleRef.current?.run();
    });

    expect(loadFaceModel).toHaveBeenCalledTimes(1);
    expect(detectFaces).toHaveBeenCalledTimes(1);
    const imageArg = detectFaces.mock.calls[0]?.[0] as {
      width?: number;
      height?: number;
      data?: Uint8ClampedArray;
    };
    expect(imageArg).toBeTruthy();
    expect(imageArg?.data).toBeInstanceOf(Uint8ClampedArray);

    // Only high-confidence detections are blurred after redraw cut-off (0.64); full detections array is retained for reporting
    expect(blurPatchMock).toHaveBeenCalledTimes(1);
    const blurArgs = blurPatchMock.mock.calls[0] ?? [];
    expect(blurArgs[2]).toBeGreaterThanOrEqual(0); // x
    expect(blurArgs[3]).toBeGreaterThanOrEqual(0); // y
    expect(blurArgs[4]).toBeGreaterThan(0); // w
    expect(blurArgs[5]).toBeGreaterThan(0); // h

    expect(setPerfReport).toHaveBeenCalled();
    const perfArg = (
      setPerfReport as unknown as { mock: { calls: unknown[][] } }
    ).mock.calls.slice(-1)[0]?.[0];
    if (typeof perfArg === "function") {
      const applied = perfArg({
        count: 0,
        total: 0,
        timings: { preprocess: 0, run: 0, post: 0, total: 0 },
      });
      expect(applied.count).toBe(1);
    } else {
      const maybe = perfArg as unknown;
      if (maybe && typeof maybe === "object" && "count" in maybe) {
        expect((maybe as { count: number }).count).toBe(1);
      }
    }

    // The full detections array is retained (should have length 2), but only high-confidence detections are blurred.
    expect(handleRef.current?.getDetections()).toHaveLength(2);
    const handle = handleRef.current;
    expect(handle).toBeDefined();
    expect(handle?.getFilteredCount?.(0.8)).toBe(1);

    act(() => {
      handleRef.current?.reset();
    });
    expect(handleRef.current?.getDetections()).toHaveLength(0);
  });

  it("falls back to FaceDetector API when available", async () => {
    blurPatchMock.mockClear();
    loadFaceModel.mockClear();
    detectFaces.mockClear();

    const detectSpy = vi
      .fn()
      .mockResolvedValue([
        { boundingBox: new DOMRectReadOnly(10, 20, 60, 50) },
        { boundingBox: new DOMRectReadOnly(100, 40, 80, 60) },
      ]);

    class FakeFaceDetector {
      // no-op options; defined for parity with real API
      constructor() {}
      detect = detectSpy;
    }

    (
      window as unknown as {
        FaceDetector?: new () => { detect: typeof detectSpy };
      }
    ).FaceDetector = FakeFaceDetector;

    const img = document.createElement("img");
    Object.defineProperty(img, "complete", { value: true });
    Object.defineProperty(img, "naturalWidth", { value: 640 });
    Object.defineProperty(img, "naturalHeight", { value: 480 });

    const canvas = document.createElement("canvas");
    canvas.width = 640;
    canvas.height = 480;

    const imgRef = { current: img } as React.RefObject<HTMLImageElement>;
    const canvasRef = { current: canvas } as React.RefObject<HTMLCanvasElement>;
    const setPerfReport: React.Dispatch<
      React.SetStateAction<PerformanceReport>
    > = vi.fn();

    const opts: FaceBlurProps["opts"] = {
      modelSize: 320,
      confThresh: 0.5,
      blurStrength: 20,
      featherPx: 2,
      setPerfReport,
    };

    const { default: FaceBlur } = await vi.importActual<
      typeof import("@/components/FaceBlur")
    >("@/components/FaceBlur");

    const handleRef = React.createRef<BlurHandler>();
    render(
      <FaceBlur
        ref={handleRef}
        imgRef={imgRef}
        canvasRef={canvasRef}
        opts={opts}
      />
    );

    await act(async () => {
      await handleRef.current?.run();
    });

    expect(detectSpy).toHaveBeenCalledTimes(1);
    expect(loadFaceModel).not.toHaveBeenCalled();
    expect(detectFaces).not.toHaveBeenCalled();
    expect(blurPatchMock).toHaveBeenCalledTimes(2);

    const handle2 = handleRef.current;
    expect(handle2).toBeDefined();
    expect(handle2?.getFilteredCount?.(0.4)).toBe(2);

    const perfArg = (
      setPerfReport as unknown as { mock: { calls: unknown[][] } }
    ).mock.calls.slice(-1)[0]?.[0];
    if (typeof perfArg === "function") {
      const applied = perfArg({
        count: 0,
        total: 0,
        timings: { preprocess: 0, run: 0, post: 0, total: 0 },
      });
      expect(applied.count).toBe(2);
    } else {
      const maybe = perfArg as unknown;
      if (maybe && typeof maybe === "object" && "count" in maybe) {
        expect((maybe as { count: number }).count).toBe(2);
      }
    }

    delete (window as { FaceDetector?: unknown }).FaceDetector;
  });
});
