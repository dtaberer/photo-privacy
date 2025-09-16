// Constants for Face and License Plate blurring

import { Size } from "@/types/detector-types";
const BASE =
  (import.meta as unknown as { env?: Record<string, string> }).env?.BASE_URL ??
  "/";
const basePath = BASE.endsWith("/") ? BASE : `${BASE}/`;

export const USE_MANUAL_REDACTOR = false; // set to true to enable the manual redactor component
export interface FaceBlurConstants {
  BLUR_DENSITY: number; // higher = more blur
  CONFIDENCE_THRESHOLD: number; // min confidence to consider a detection
  RUN_FACE_DETECTION: boolean; // whether to run face detection at all
  IOU_THRESHOLD: number; // legacy (face-api path); kept for compatibility
  PAD_RATIO: number; // usually 0.0 or 0.1
  FEATHER_PX: number; // usually 1 or 2
  MAX_DETECTED_FACES: number; // safety limit
  FAST_MODE: boolean; // if true, use faster but less accurate model
  MODEL_SIZE: number; // model input size (width and height)
  MODELS_URL: string; // base URL for face-api models
  MODEL_URL: string; // full URL for ONNX face detection model
  // ONNX post-process tuning (center-size and DFL paths)
  NMS_IOU: number; // IoU threshold for suppression
  NMS_CONTAIN: number; // containment ratio to drop nested boxes
  NMS_CENTER: number; // normalized center distance ratio to merge
  PREFILTER_MIN_SIDE_RATIO: number; // min side as ratio of min(image W,H)
  PREFILTER_AR_MIN: number; // min aspect ratio (w/h)
  PREFILTER_AR_MAX: number; // max aspect ratio (w/h)
  TTA_FLIP: boolean; // run horizontal flip test-time augmentation
  VERTICAL_SHIFT: number; // fraction of box height to shift blur upward (e.g., 0.1)
  FORCE_CENTER_NORM: boolean; // force normalized center-size decode for E=5 heads
  OFFSET_X: number; // pixel offset to nudge blur horizontally (positive = right)
  OFFSET_Y: number; // pixel offset to nudge blur vertically (positive = down)
  OFFSET_FX: number; // fraction of width to offset horizontally (e.g., -0.03 for left)
  OFFSET_FY: number; // fraction of height to offset vertically (e.g., -0.03 for up)
  // Adaptive padding for different face sizes
  PAD_RATIO_AT_SMALL: number; // pad ratio when face min side <= PAD_SMALL_SIDE
  PAD_RATIO_AT_LARGE: number; // pad ratio when face min side >= PAD_LARGE_SIDE
  PAD_SMALL_SIDE: number; // px threshold for "small" faces
  PAD_LARGE_SIDE: number; // px threshold for "large" faces
}

export interface LicensePlateBlurConstants {
  BLUR_DENSITY: number; // higher = more blur
  CONFIDENCE_THRESHOLD: number; // min confidence to consider a detection
  RUN_LICENSE_PLATE_DETECTION: boolean; // whether to run license plate detection at all
  MODEL_SIZE: number; // model input size (width and height)
  MODEL_URL: string; // full URL for license plate detection model
  IOU_THRESHOLD: number; // for non-max suppression
  PAD_RATIO: number; // usually 0.0 or 0.1
  FEATHER_PX: number; // usually 1 or 2
}

// Combined constants interface
export interface PrivacyScrubberConstants {
  face: FaceBlurConstants;
  licensePlate: LicensePlateBlurConstants;
}

// Used in FaceBlur.tsx and LicensePlateBlur.tsx
export const FaceBlurConstants: FaceBlurConstants = {
  BLUR_DENSITY: 40,
  CONFIDENCE_THRESHOLD: 0.35,
  RUN_FACE_DETECTION: true,
  IOU_THRESHOLD: 0.3,
  PAD_RATIO: 0.12,
  FEATHER_PX: 1,
  MAX_DETECTED_FACES: 50,
  FAST_MODE: false,
  MODEL_SIZE: 416,
  MODELS_URL: `${basePath}models/face-api`,
  MODEL_URL: `${basePath}models/face/yolov11n-face.onnx`,
  // ONNX post-process defaults (tuned to reduce duplicates)
  NMS_IOU: 0.4,
  NMS_CONTAIN: 0.4,
  NMS_CENTER: 0.55,
  PREFILTER_MIN_SIDE_RATIO: 0.015,
  PREFILTER_AR_MIN: 0.5,
  PREFILTER_AR_MAX: 2.0,
  TTA_FLIP: false,
  VERTICAL_SHIFT: 0.2,
  FORCE_CENTER_NORM: false,
  OFFSET_X: -12,
  OFFSET_Y: -12,
  OFFSET_FX: -0.18,
  OFFSET_FY: -0.08,
  PAD_RATIO_AT_SMALL: 0.18,
  PAD_RATIO_AT_LARGE: 0.06,
  PAD_SMALL_SIDE: 140,
  PAD_LARGE_SIDE: 420,
};

export const LicensePlateBlurConstants: LicensePlateBlurConstants = {
  BLUR_DENSITY: 40,
  CONFIDENCE_THRESHOLD: 0.02,
  RUN_LICENSE_PLATE_DETECTION: true,
  MODEL_SIZE: 800,
  MODEL_URL: `${basePath}models/license-plate-finetune-v1n.onnx`,
  IOU_THRESHOLD: 0.02,
  PAD_RATIO: 0.08,
  FEATHER_PX: 0,
};

export const IMAGE_SIZE: Size = { w: 1280, h: 720 };

export const PERFORMANCE_REPORT_ZEROS = {
  count: 0,
  total: 0,
  timings: {
    preprocess: 0,
    run: 0,
    post: 0,
    total: 0,
  },
};

export interface DemoSteps {
  [index: number]: string;
}

export const DemoSteps: DemoSteps = [
  "After loading your image, click the Scrub Image button to start the redaction process. \
  This normally takes around 8-10 seconds to complete detection.",

  "Select the 'Blur Opacity' to adjust the density and obscurity level of the blurred region. \
  Try it!",

  "The Filter control changes the level of sensitivity of detection and is driven by confidence thresholds. \
  It can drastically cut down the noise levels, but may also miss some distant or obscured subjects. \
  Try it!",

  "The Feather control adjusts the softness of the edges of the redacted areas. \
  Increasing the feathering can help blend the redacted areas more naturally into the background. \
  Try it!",

  "When you are ready to download your redacted image, click the Download button. \
  Your browser will prompt you to save the image file to your device.",
];
