// File: src/__tests__/SetupTests.ts
import "@testing-library/jest-dom/vitest"; // extends Vitest's expect with jest-dom matchers
import React from "react";
import { afterEach, vi } from "vitest";
import { cleanup } from "@testing-library/react";

// ---- Minimal globals/types used by tests ----
declare global {
  interface Window {
    FaceDetector?: new () => {
      detect: (
        img: HTMLImageElement
      ) => Promise<Array<{ boundingBox: DOMRectReadOnly }>>;
    };
  }
}

// Provide a resilient 2D context mock for all canvases in tests
const make2d = () => ({
  canvas: document.createElement("canvas"),
  clearRect: vi.fn(),
  drawImage: vi.fn(),
  fillRect: vi.fn(),
  beginPath: vi.fn(),
  arc: vi.fn(),
  fill: vi.fn(),
  save: vi.fn(),
  restore: vi.fn(),
  strokeRect: vi.fn(),
  translate: vi.fn(),
  scale: vi.fn(),
  createLinearGradient: () => ({ addColorStop: vi.fn() }),
  createRadialGradient: () => ({ addColorStop: vi.fn() }),
  getImageData: vi.fn(() => ({
    data: new Uint8ClampedArray(),
    width: 0,
    height: 0,
  })),
  putImageData: vi.fn(),
  set filter(_value: string) {
    /* noop */
  },
  get filter() {
    return "";
  },
  set globalCompositeOperation(_value: string) {
    /* noop */
  },
  get globalCompositeOperation() {
    return "source-over";
  },
});

Object.defineProperty(HTMLCanvasElement.prototype, "getContext", {
  value(kind: string) {
    if (kind === "2d") return make2d();
    return null;
  },
  writable: true,
});

// Blob URL helper used by the app during tests
if (typeof URL.createObjectURL !== "function") {
  URL.createObjectURL = (_obj: Blob | MediaSource) => {
    void _obj;
    return "blob:mock-url";
  };
}

// ---- Global component stubs for integration-style tests ----
// Some specs import components as *named* (e.g., { LicensePlateBlur }) while others use default.
// These stubs export BOTH default and named symbols so either style mounts cleanly.

type BlurHandle = {
  run: () => Promise<void>;
  redraw: () => void;
  getDetections?: () => unknown;
  reset?: () => void;
};

vi.mock("../components/LicensePlateBlur", () => {
  const Comp = React.forwardRef<BlurHandle, Record<string, unknown>>(
    (_props, ref) => {
      const handle: BlurHandle = {
        run: vi.fn().mockResolvedValue(undefined),
        redraw: vi.fn(),
        getDetections: vi.fn().mockReturnValue([]),
        reset: vi.fn(),
      };
      if (typeof ref === "function") ref(handle);
      else if (ref)
        (ref as React.MutableRefObject<BlurHandle | null>).current = handle;
      return null;
    }
  );
  return { __esModule: true, default: Comp, LicensePlateBlur: Comp };
});

vi.mock("../components/FaceBlur", () => {
  const Comp = React.forwardRef<BlurHandle, Record<string, unknown>>(
    (_props, ref) => {
      const handle: BlurHandle = {
        run: vi.fn().mockResolvedValue(undefined),
        redraw: vi.fn(),
        getDetections: vi.fn().mockReturnValue([]),
        reset: vi.fn(),
      };
      if (typeof ref === "function") ref(handle);
      else if (ref)
        (ref as React.MutableRefObject<BlurHandle | null>).current = handle;
      return null;
    }
  );
  return { __esModule: true, default: Comp, FaceBlur: Comp };
});

// Cleanup DOM after each test
afterEach(() => cleanup());
