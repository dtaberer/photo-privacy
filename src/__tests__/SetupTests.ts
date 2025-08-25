// src/__tests__/SetupTests.ts
import "@testing-library/jest-dom/vitest";
import { afterEach, vi } from "vitest";
import { cleanup } from "@testing-library/react";

afterEach(() => cleanup());

// mark test environment so setupOrt() is a no-op in tests
Object.defineProperty(window, "__TEST__", { value: true, configurable: true });

// Canvas stub...
Object.defineProperty(HTMLCanvasElement.prototype, "getContext", {
  value: vi.fn((ctxType: string) => {
    void ctxType;
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
