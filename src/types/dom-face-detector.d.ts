// src/types/index.d.ts
// Central ambient typings for browser/3P APIs used by the app.
// Keep this file under `src/` so it's included by tsconfig.

export {};

declare global {
  /** Optional browser API: Face Detection (Shape Detection API). */
  interface Window {
    FaceDetector?: new (options?: {
      fastMode?: boolean;
      maxDetectedFaces?: number;
    }) => {
      detect(image: CanvasImageSource): Promise<
        Array<{
          boundingBox: DOMRectReadOnly;
        }>
      >;
    };
  }
}

/** Lightweight module stub for face-api.js so TS doesn't complain about types. */
declare module "face-api.js" {
  const anyExport: unknown;
  export = anyExport;
}
