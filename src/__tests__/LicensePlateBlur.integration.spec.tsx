import React from "react";
import { act, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { BlurHandler, PerformanceReport } from "@/types/detector-types";

const blurPatchMock = vi.fn();
const letterboxMock = vi.fn(() => ({
  input: new Float32Array(3 * 32 * 32),
  scale: 1,
  pad: { x: 0, y: 0 },
  S: 32,
}));
const parseYoloMock = vi.fn(() => [
  { x: 10, y: 12, w: 40, h: 18, conf: 0.9 },
  { x: 80, y: 50, w: 30, h: 12, conf: 0.2 },
]);
const filterByMinConfMock = vi.fn(
  <T extends { conf?: number }>(arr: T[], conf: number) =>
    arr.filter((b) => (b.conf ?? 0) >= conf)
);

vi.mock("@/components/utils/license-plate-blur-utils", () => ({
  __esModule: true,
  letterbox: letterboxMock,
  nms: vi.fn((boxes: unknown) => boxes),
  firstValue: vi.fn((out: Record<string, unknown>) => Object.values(out)[0]),
  parseYolo: parseYoloMock,
  get2D: vi.fn((tensor: unknown) => tensor),
  blurPatchWithFeather: blurPatchMock,
  filterByMinConf: filterByMinConfMock,
}));

const runMock = vi.fn().mockResolvedValue({
  out0: { data: new Float32Array([1, 2, 3]), dims: [1, 3] },
});

class FakeTensor {
  constructor(
    public type: string,
    public data: Float32Array,
    public dims: number[]
  ) {}
}

const ortForceBasicWasmMock = vi.fn();
const createOrtSessionMock = vi.fn().mockResolvedValue({
  inputNames: ["images"],
  run: runMock,
});

vi.mock("@/ort-setup", () => ({
  __esModule: true,
  ort: { Tensor: FakeTensor },
  ortForceBasicWasm: ortForceBasicWasmMock,
  createOrtSession: createOrtSessionMock,
}));

const fetchMock = vi.fn().mockResolvedValue({
  ok: true,
  arrayBuffer: async () => new ArrayBuffer(16 * 1024),
});


let originalRAF: typeof requestAnimationFrame;
let originalFetch: typeof fetch;
let originalImage: typeof Image;

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  originalRAF = window.requestAnimationFrame;
  window.requestAnimationFrame = ((cb: FrameRequestCallback) => {
    cb(performance.now());
    return 1;
  }) as typeof requestAnimationFrame;
  originalFetch = globalThis.fetch;
  vi.stubGlobal("fetch", fetchMock);
  originalImage = globalThis.Image;
  vi.stubGlobal(
    "Image",
    class {
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      width = 200;
      height = 120;
      naturalWidth = 200;
      naturalHeight = 120;
      set src(_value: string) {
        queueMicrotask(() => this.onload?.());
      }
    }
  );
});

afterEach(() => {
  window.requestAnimationFrame = originalRAF;
  globalThis.fetch = originalFetch;
  globalThis.Image = originalImage;
});

describe("LicensePlateBlur integration", () => {
  it("loads model, runs detection, and applies blur", async () => {
    const img = document.createElement("img");
    img.width = 640;
    img.height = 480;
    const canvas = document.createElement("canvas");
    canvas.width = 640;
    canvas.height = 480;

    const imgRef = { current: img } as React.RefObject<HTMLImageElement>;
    const canvasRef = { current: canvas } as React.RefObject<HTMLCanvasElement>;

    const setPerfReport: React.Dispatch<
      React.SetStateAction<PerformanceReport>
    > = vi.fn();

    const { default: LicensePlateBlur } = await vi.importActual<
      typeof import("@/components/LicensePlateBlur")
    >("@/components/LicensePlateBlur");

    const handleRef = React.createRef<BlurHandler>();

    render(
      <LicensePlateBlur
        ref={handleRef}
        imgRef={imgRef}
        canvasRef={canvasRef}
        opts={{
          modelSize: 320,
          confThresh: 0.5,
          blurStrength: 25,
          featherPx: 2,
          setPerfReport,
        }}
      />
    );

    await act(async () => {
      await handleRef.current?.run();
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(ortForceBasicWasmMock).toHaveBeenCalledTimes(1);
    expect(createOrtSessionMock).toHaveBeenCalledTimes(1);
    expect(runMock).toHaveBeenCalledTimes(1);
    expect(blurPatchMock).toHaveBeenCalledTimes(1);
    expect(filterByMinConfMock).toHaveBeenCalledWith(expect.any(Array), 0.5);
    expect(setPerfReport).toHaveBeenCalled();

    expect(handleRef.current?.getDetections()).toHaveLength(2);
    const handle = handleRef.current;
    expect(handle).toBeDefined();
    expect(handle?.getFilteredCount?.(0.5)).toBe(1);

    await act(async () => {
      await handleRef.current?.redraw();
    });

    act(() => {
      handleRef.current?.reset();
    });
    expect(handleRef.current?.getDetections()).toHaveLength(0);
  });
});
