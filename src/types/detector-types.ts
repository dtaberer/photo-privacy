// Path: src/types/detector-types.ts
// Centralized shared types for detectors, geometry, and perf reporting.

/** Width/height in pixels. Natural or canvas space depending on context. */
export interface Size {
  w: number;
  h: number;
}

/** Axis-aligned box in (x, y, w, h) format, pixels in the current space. */
export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Rect alias kept for legacy imports. */
export type Rect = Box;

/** Generic detection record with optional classing and metadata. */
export interface Detection<TMeta = unknown> {
  box: Box;
  /** Confidence score in [0,1]. */
  score: number;
  /** Optional class id when model is multi-class. */
  classId?: number;
  /** Optional human label. */
  label?: string;
  /** Additional detector-specific details. */
  meta?: TMeta;
}

export type Detections<TMeta = unknown> = Detection<TMeta>[];

/**
 * Common interface exposed by blur components (Face/Plate).
 * - `run` performs detection and draws results onto the target canvas.
 * - `redraw` re-applies current detections (e.g., when sliders change).
 * - `getDetections` returns a shallow copy of current detections.
 * - `reset` clears any cached detections.
 */
export interface BlurHandler<TBox = Box> {
  run: () => Promise<void>;
  redraw: () => void | Promise<void>;
  getDetections: () => TBox[];
  reset: () => void;
  /** Optional: return count of current detections meeting a confidence threshold. */
  getFilteredCount?: (confThresh: number) => number;
}

/** Timing breakdown for one detection cycle (ms). */
export interface PerformanceTimings {
  preprocess: number;
  run: number;
  post: number;
  total: number;
}

/** Aggregate performance accounting for multiple runs within a session. */
export interface PerformanceReport {
  /** Number of items processed (e.g., detections). */
  count: number;
  /** Wall-clock total for the pipeline (ms). */
  total: number;
  timings: PerformanceTimings;
}

/** Distinguishes detector families for UI wiring. */
export type DetectorKind = "face" | "plate";

/** Nullable helper. */
export type Maybe<T> = T | null | undefined;

// Re-exports (opt-in): add here if you later want to expose component handles centrally.
// export type { CanvasHandle } from "@/components/Canvas";
// export type { PlateRedactorHandle } from "@/components/PlateRedactor";
