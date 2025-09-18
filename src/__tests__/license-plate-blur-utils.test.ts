import { describe, it, expect } from "vitest";
import {
  iou,
  nms,
  strengthToBlur,
  letterbox,
  parseYolo,
  filterByMinConf,
  toRows,
  get2D,
} from "@/components/utils/license-plate-blur-utils";
import { Tensor } from "onnxruntime-web";

// Helpers to fabricate simple tensors
function makeTensor(data: number[], dims: number[]): Tensor {
  return new Tensor("float32", new Float32Array(data), dims);
}

describe("geometry + filtering", () => {
  it("iou returns 0 for no overlap and 1 for identical", () => {
    expect(
      iou({ x: 0, y: 0, w: 10, h: 10 }, { x: 20, y: 20, w: 5, h: 5 })
    ).toBe(0);
    expect(
      iou({ x: 5, y: 5, w: 10, h: 10 }, { x: 5, y: 5, w: 10, h: 10 })
    ).toBe(1);
  });

  it("nms suppresses overlapping lower-confidence boxes", () => {
    const kept = nms(
      [
        { x: 0, y: 0, w: 10, h: 10, conf: 0.9 },
        { x: 1, y: 1, w: 10, h: 10, conf: 0.5 },
        { x: 50, y: 50, w: 5, h: 5, conf: 0.8 },
      ],
      0.3
    );
    expect(kept.length).toBe(2);
    expect(kept[0]?.conf).toBe(0.9);
  });

  it("strengthToBlur buckets correctly", () => {
    const low = strengthToBlur(5);
    expect(low.passes).toBe(1);
    const mid = strengthToBlur(60);
    expect(mid.passes).toBeGreaterThanOrEqual(2);
    const hi = strengthToBlur(95);
    expect(hi.radiusPx).toBeGreaterThanOrEqual(mid.radiusPx);
    expect(hi.passes).toBeGreaterThanOrEqual(mid.passes);
  });

  it("filterByMinConf parses numeric strings", () => {
    const res = filterByMinConf(
      [{ conf: 0.2 }, { conf: "0.7" }, { conf: null }, { conf: "NaN" }, {}],
      0.5
    );
    expect(res.length).toBe(1);
  });
});

describe("letterbox + parseYolo variations", () => {
  it("letterbox produces expected square output & scale", () => {
    const img = document.createElement("img");
    Object.defineProperty(img, "naturalWidth", {
      value: 100,
      configurable: true,
    });
    Object.defineProperty(img, "naturalHeight", {
      value: 50,
      configurable: true,
    });
    const { input, scale, pad } = letterbox(img, 128);
    expect(input.length).toBe(3 * 128 * 128);
    expect(scale).toBeCloseTo(128 / 100, 5);
    expect(pad.y).toBeGreaterThan(0); // vertical centering
  });

  it("parseYolo supports [1,C,N] shape (C first)", () => {
    // valuesPer = 6 (cx,cy,w,h,conf,class)
    const N = 2;
    const C = 6;
    // Layout for branch: [1,C,N] -> data[c * N + i]
    // Candidate 0 high confidence, candidate 1 low
    const data: number[] = [];
    function pushCandidate(
      cx: number,
      cy: number,
      w: number,
      h: number,
      conf: number,
      cls: number
    ) {
      // We'll append into channel-major arrays later
      tmp.push({ cx, cy, w, h, conf, cls });
    }
    interface Candidate {
      cx: number;
      cy: number;
      w: number;
      h: number;
      conf: number;
      cls: number;
    }
    const tmp: Candidate[] = [];
    pushCandidate(50, 50, 20, 10, 0.9, 0.9);
    pushCandidate(30, 30, 5, 5, 0.3, 0.8);
    // Build channel-major arrays
    for (const channel of [
      (i: number) => tmp[i]!.cx,
      (i: number) => tmp[i]!.cy,
      (i: number) => tmp[i]!.w,
      (i: number) => tmp[i]!.h,
      (i: number) => tmp[i]!.conf,
      (i: number) => tmp[i]!.cls,
    ]) {
      for (let i = 0; i < N; i++) data.push(channel(i));
    }
    const boxes = parseYolo(new Float32Array(data), [1, C, N], {
      conf: 0.25,
      pad: { x: 0, y: 0 },
      scale: 1,
      padRatio: 0.1,
      max: 10,
    });
    expect(boxes.length).toBe(1);
    expect(boxes[0]!.conf).toBeGreaterThan(0.5);
  });

  it("parseYolo supports [N,K] variant (R,K) path", () => {
    // dims [R,K] where K>=5, choose layout [N,K]
    const R = 2;
    const K = 6;
    const flat: number[] = [];
    // candidate0 high, candidate1 high but below threshold
    const cand = [
      [40, 40, 10, 10, 0.8, 0.9],
      [20, 20, 5, 5, 0.2, 0.9],
    ];
    for (const row of cand) flat.push(...row);
    const boxes = parseYolo(new Float32Array(flat), [R, K], {
      conf: 0.3,
      pad: { x: 0, y: 0 },
      scale: 1,
      padRatio: 0.0,
      max: 5,
    });
    expect(boxes.length).toBe(1);
  });

  it("parseYolo gracefully ignores NaNs & low conf", () => {
    const arr = new Float32Array([
      // Single fallback layout (no dims branch) valuesPer=6
      NaN,
      NaN,
      NaN,
      NaN,
      0.9,
      0.9,
      10,
      10,
      4,
      4,
      0.05,
      0.9, // low conf
    ]);
    const boxes = parseYolo(
      arr,
      [
        /* dims unused path */
      ],
      {
        conf: 0.25,
        pad: { x: 0, y: 0 },
        scale: 1,
        padRatio: 0.0,
      }
    );
    expect(boxes.length).toBe(0);
  });
});

describe("toRows + get2D tensor helpers", () => {
  it("toRows returns same data when layout already [1,N,M] aligned", () => {
    const t = makeTensor([1, 2, 3, 4, 5, 6], [1, 2, 3]);
    const { rows, N, M } = toRows(t as unknown as Tensor);
    expect(N).toBeGreaterThan(0);
    expect(rows.length).toBe(N * M);
  });

  it("get2D rejects non-float32 data", () => {
    const bad = {
      dims: [1, 2],
      data: new Int32Array([1, 2]),
    } as unknown as Tensor;
    expect(() => get2D(bad)).toThrow();
  });
});
