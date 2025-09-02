export type ControlPanelProps = {
  blurVal: number;
  busy?: boolean;
  iouThresh?: number;
  confVal?: number;
  controlName: string;
  count: number;
  setBlurVal: (val: number) => void;
  setThreshVal: (val: number) => void;
  featherVal?: number;
  setFeatherVal?: (v: number) => void;
};
