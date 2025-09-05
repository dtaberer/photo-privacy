import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render } from "@testing-library/react";
import LicensePlateBlur from "../components/LicensePlateBlur";

type PerformanceReport = {
  count: number;
  total: number;
  timings: { preprocess: number; run: number; post: number; total: number };
};
type BlurHandler = {
  run: () => Promise<void> | void;
  redraw: () => Promise<void> | void;
};

vi.mock("../components/utils/license-plate-blur-utils", () => ({
  default: {},
  letterbox: () => ({
    input: new Float32Array(3 * 32 * 32),
    scale: 1,
    pad: [0, 0] as const,
  }),
  nms: () => [] as unknown[],
  drawBox: () => void 0,
  firstValue: () => ({ data: new Float32Array(1), dims: [1, 1] }),
  parseYolo: () => [],
  get2D: (t: { data: Float32Array; dims: number[] }) => t,
  blurPatchWithFeather: () => void 0,
  filterByMinConf: <T extends { score?: number }>(xs: T[], _c: number) => {
    void _c;
    return xs;
  },
}));

vi.mock("../components/ort-setup", () => ({
  ort: {},
  ortForceBasicWasm: vi.fn(),
  createOrtSession: async () => ({
    inputNames: ["images"],
    run: async () => ({ out0: { data: new Float32Array([0]), dims: [1, 1] } }),
  }),
}));

describe("LicensePlateBlur", () => {
  it("renders and exposes run/redraw", async () => {
    const img = document.createElement("img");
    img.width = 800;
    img.height = 600;
    img.src = "";
    const canvas = document.createElement("canvas");
    canvas.width = 800;
    canvas.height = 600;

    const imgRef = { current: img } as React.RefObject<HTMLImageElement>;
    const canvasRef = { current: canvas } as React.RefObject<HTMLCanvasElement>;

    const setPerfReport = ((
      updater: PerformanceReport | ((p: PerformanceReport) => PerformanceReport)
    ) => {
      if (typeof updater === "function") {
        const next = updater({
          count: 0,
          total: 0,
          timings: { preprocess: 0, run: 0, post: 0, total: 0 },
        });
        void next;
      }
    }) as unknown as React.Dispatch<React.SetStateAction<PerformanceReport>>;

    let handle: BlurHandler | null = null;

    render(
      <LicensePlateBlur
        ref={(h: unknown) => {
          handle = h as BlurHandler | null;
        }}
        imgRef={imgRef}
        canvasRef={canvasRef}
        opts={{
          modelSize: 320,
          confThresh: 0.02,
          blurStrength: 30,
          setPerfReport,
          featherPx: 0,
        }}
      />
    );

    expect(handle).toBeTruthy();
    await (handle! as Required<BlurHandler>).run();
    await (handle! as Required<BlurHandler>).redraw();
  });
});
