export type ControlPanelProps = {
  blurVal: number;
  busy?: boolean;
  confVal: number;
  controlName: string;
  count: number;
  setBlurVal: (val: number) => void;
  setThreshVal: (val: number) => void;
};
