// src/types/face-api.d.ts
declare module "face-api.js" {
  export interface Box {
    x: number;
    y: number;
    width: number;
    height: number;
  }
  export interface TinyFaceDetectorOptions {
    inputSize?: number;
    scoreThreshold?: number;
  }
  export interface SsdMobilenetv1Options {
    minConfidence?: number;
  }
  export const nets: {
    tinyFaceDetector: { loadFromUri(url: string): Promise<void> };
    ssdMobilenetv1: { loadFromUri(url: string): Promise<void> };
  };
  export function detectAllFaces(
    input: HTMLImageElement | HTMLCanvasElement | OffscreenCanvas,
    options: TinyFaceDetectorOptions | SsdMobilenetv1Options
  ): Promise<Array<{ box: Box }>>;
}
