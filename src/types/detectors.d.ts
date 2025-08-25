export type ImgSize = { w: number; h: number };
export type BBox = { x: number; y: number; w: number; h: number };
export type DetectTimings = {
  preprocess?: number;
  run?: number;
  post?: number;
  total?: number;
};

export type DetectionResult = {
  count: number;
  boxes?: BBox[];
  timings?: DetectTimings; // may be undefined on fallback
};

export type AssertFn = (cond: unknown, msg?: string) => asserts cond;
export type Dims3 = readonly [1, number, number];
export type YoloRow = {
  x: number;
  y: number;
  w: number;
  h: number;
  conf: number;
};

export type RawRow = {
  a: number;
  b: number;
  c: number;
  d: number;
  conf: number;
};

export type BoxScored = BBox & { conf: number };

export type Corner = {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  conf: number;
};

export type DetectionResult = {
  count: number;
  boxes?: BBox[];
  timings?: DetectTimings;
};

export type PlateDetectOpts = {
  /** e.g. "/models/license-plate-finetune-v1n.onnx" */
  modelUrl: string;
  /** Square input size; many YOLOv5/8 models use 640; change if needed */
  modelSize?: number;
  /** Confidence threshold 0..1 */
  confThresh?: number;
  /** IoU threshold for NMS 0..1 */
  iouThresh?: number;
  /** Letterbox color for padding */
  padColor?: readonly [number, number, number];
  /** If you know your model outputs 0..1 normalized cx,cy,w,h set true.
      If you know they’re pixels set false. Omit to auto-detect. */
  assumeNormalized?: boolean;
  /**
   * Box format coming from the model. Use 'auto' to detect.
   * - 'cxcywh'  : center x,y then width,height
   * - 'xywh'    : top-left x,y then width,height
   * - 'xyxy'    : top-left x,y then bottom-right x,y
   */
  boxFormat?: "auto" | "cxcywh" | "xywh" | "xyxy";
  /** Force mapping space; 'auto' tries letterbox/stretch/normalized and scores them */
  boxSpace?: "auto" | "letterbox" | "stretch" | "normalized";
};

export type PlateBlurOpts = PlateDetectOpts & {
  /** Pixels of blur to apply on each detected region */
  blurRadius: number;
};

export type MPFaceOpts = {
  /** Path to your .task model; e.g., "/models/mediapipe/face_detector.task" */
  modelAssetPath: string;
  /** Optional base for WASM files; omit to use CDN */
  tasksBaseUrl?: string;
  /** 0..1, default 0.5 */
  minDetectionConfidence?: number;
};

export type FaceBlurOpts = MPFaceOpts & {
  /** Pixels of blur to apply to each face */
  blurRadius: number;
};

export type AssertFn = (cond: unknown, msg?: string) => asserts cond;
