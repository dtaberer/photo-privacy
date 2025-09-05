// Minimal typings for the subset of face-api.js used in FaceBlur.tsx.
// Extend if you start using more APIs.
declare module "face-api.js" {
  export interface Box {
    conf: number;
    w: number;
    h: number;
    x: number;
    y: number;
    width: number;
    height: number;
  }

  export interface FaceDetection {
    box: Box;
  }

  export class TinyFaceDetectorOptions {
    constructor(opts?: { inputSize?: number; scoreThreshold?: number });
  }

  export namespace nets {
    const tinyFaceDetector: {
      loadFromUri(url: string): Promise<void>;
    };
  }

  export function detectAllFaces(
    input: HTMLImageElement | HTMLCanvasElement | HTMLVideoElement,
    options: TinyFaceDetectorOptions
  ): Promise<FaceDetection[]>;
}
