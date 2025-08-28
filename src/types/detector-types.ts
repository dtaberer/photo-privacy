export type LicensePlateBlurProps = {
  imgRef: React.RefObject<HTMLImageElement | null>;
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  modelSize: number;
  confThresh: number;
  iouThresh: number;
  blurStrength: number; // interpreted as strength 0–100
  padRatio: number;
  modelUrl: string;
  debugMode?: boolean;
};

export type Box = { x: number; y: number; w: number; h: number; conf: number };
export type Size = { w: number; h: number };
export type LicePlateBlurHandler = {
  run: () => Promise<void>;
  redraw: () => void;
};
