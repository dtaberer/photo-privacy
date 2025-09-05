export {};
declare global {
  interface Window {
    __TEST__?: boolean;
  }

  export type DetectTimings = {
    preprocess: number | 0;
    run: number | 0;
    post: number | 0;
    total: number | 0;
  };
  export type BlurTimings = {
    total: number | 0;
    faceapi: number | 0;
    canvas: number | 0;
    stackBlur: number | 0;
  };
  export type ProcessTimings = {
    detect: DetectTimings;
    blur: BlurTimings;
    total: number | 0;
  };

  // Canonical types are defined in src/types/detector-types.ts
  export type PerformanceReport = import("./detector-types").PerformanceReport;
  export type BlurHandler = import("./detector-types").BlurHandler<
    import("./detector-types").Box
  >;
}
