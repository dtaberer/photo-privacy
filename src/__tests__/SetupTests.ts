// src/__tests__/SetupTests.ts
import "@testing-library/jest-dom/vitest";

import { afterEach, vi } from "vitest";
import { cleanup } from "@testing-library/react";

afterEach(() => cleanup());

// Canvas stub so jsdom doesn't crash on getContext('2d')
Object.defineProperty(HTMLCanvasElement.prototype, "getContext", {
  value: vi.fn((ctxType: string) => {
    // mark parameter as used to satisfy no-unused-vars
    void ctxType;

    // Minimal 2D-like context stub for our code paths
    return {
      fillRect: () => {},
      clearRect: () => {},
      drawImage: () => {},
      beginPath: () => {},
      rect: () => {},
      clip: () => {},
      save: () => {},
      restore: () => {},
      setTransform: () => {},
      filter: "",
    };
  }),
  writable: true,
});
