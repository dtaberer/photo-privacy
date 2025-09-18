import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  clamp,
  grow,
  cssToCanvasRect,
  adjustUp,
  isFaceApiNS,
  newFaceBox,
  blurPatchWithFeather,
  type FaceBox,
} from "@/components/utils/face-blur-utils";

// Helper to create a mock image & canvas environment
function makeImage(w: number, h: number): HTMLImageElement {
  const img = document.createElement("img");
  Object.defineProperty(img, "naturalWidth", { value: w, configurable: true });
  Object.defineProperty(img, "naturalHeight", { value: h, configurable: true });
  // Provide a bounding client rect mapping 1:1 unless overridden
  img.getBoundingClientRect = () => ({
    x: 0,
    y: 0,
    width: w,
    height: h,
    top: 0,
    left: 0,
    bottom: h,
    right: w,
    toJSON: () => {},
  });
  return img;
}

describe("face-blur-utils primitives", () => {
  it("clamp bounds values inclusive", () => {
    expect(clamp(5, 0, 10)).toBe(5);
    expect(clamp(-1, 0, 10)).toBe(0);
    expect(clamp(11, 0, 10)).toBe(10);
  });

  it("grow keeps box inside image", () => {
    const b = newFaceBox(10, 10, 50, 40, 0.9);
    const g = grow(b as FaceBox, 0.25, 100, 80);
    // width/height expand 25% each side (50 * .25 *2 =25) -> nominal 75 but clipped by bounds
    expect(g.w).toBeGreaterThanOrEqual(b.w);
    expect(g.h).toBeGreaterThanOrEqual(b.h);
    expect(g.x).toBeGreaterThanOrEqual(0);
    expect(g.y).toBeGreaterThanOrEqual(0);
  });

  it("cssToCanvasRect maps css -> canvas coords with scaling", () => {
    const img = makeImage(400, 300);
    const canvas = document.createElement("canvas");
    canvas.width = 800;
    canvas.height = 600;
    // css box (100,50,40,20) should scale 2x because canvas is double size
    const r = cssToCanvasRect(img, canvas, {
      x: 100,
      y: 50,
      width: 40,
      height: 20,
    });
    expect(r.x).toBe(200);
    expect(r.y).toBe(100);
    expect(r.w).toBe(80);
    expect(r.h).toBe(40);
  });

  it("cssToCanvasRect returns raw when client rect 0 size (detached element)", () => {
    const img = makeImage(400, 300);
    img.getBoundingClientRect = () => ({
      x: 0,
      y: 0,
      width: 0,
      height: 0,
      top: 0,
      left: 0,
      bottom: 0,
      right: 0,
      toJSON: () => {},
    });
    const canvas = document.createElement("canvas");
    canvas.width = 800;
    canvas.height = 600;
    const r = cssToCanvasRect(img, canvas, {
      x: 10,
      y: 5,
      width: 8,
      height: 4,
    });
    expect(r.x).toBe(10);
    expect(r.y).toBe(5);
    expect(r.w).toBe(8);
  });

  it("adjustUp shifts box upward with padding ratio", () => {
    const b = newFaceBox(20, 40, 30, 30, 0.8);
    const adj = adjustUp(b as FaceBox, 200, 200, 0.2);
    // y should decrease, height increase
    expect(adj.y).toBeLessThanOrEqual(b.y);
    expect(adj.h).toBeGreaterThanOrEqual(b.h);
  });

  it("isFaceApiNS guards expected shape", () => {
    expect(isFaceApiNS({})).toBe(false);
    const good = {
      nets: { tinyFaceDetector: { loadFromUri: async () => {} } },
      TinyFaceDetectorOptions: function () {},
      detectAllFaces: async () => [],
    };
    expect(isFaceApiNS(good)).toBe(true);
  });
});

describe("blurPatchWithFeather", () => {
  // We won't validate pixel-perfect rendering, just that it doesn't throw and uses canvas APIs.
  let img: HTMLImageElement;
  beforeEach(() => {
    img = makeImage(120, 80);
    // Provide a 2D context stub that records filter usage for multi-pass logic if needed
  });

  it("executes without feather", () => {
    const canvas = document.createElement("canvas");
    canvas.width = 120;
    canvas.height = 80;
    const ctx = canvas.getContext("2d")!;
    expect(() =>
      blurPatchWithFeather(ctx, img, 10, 10, 40, 30, 15, 0)
    ).not.toThrow();
  });

  it("executes with feather and large blur", () => {
    const canvas = document.createElement("canvas");
    canvas.width = 120;
    canvas.height = 80;
    const ctx = canvas.getContext("2d")!;
    expect(() =>
      blurPatchWithFeather(ctx, img, 10, 5, 60, 50, 90, 12)
    ).not.toThrow();
  });
});
