export interface FaceApiNS {
  nets: { tinyFaceDetector: { loadFromUri(base: string): Promise<void> } };
  TinyFaceDetectorOptions: new (opts?: {
    scoreThreshold?: number;
    inputSize?: number;
  }) => unknown;
  detectAllFaces: (
    img: CanvasImageSource,
    options: unknown
  ) => Promise<
    Array<{ box: { x: number; y: number; width: number; height: number } }>
  >;
}
