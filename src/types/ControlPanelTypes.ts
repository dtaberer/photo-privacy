export type ControlPanelProps = {
  blurVal: number;
  setBlurVal: (val: number) => void;
  confVal: number;
  setConfVal: (val: number) => void;
  controlName: string;
  busy?: boolean;
  count: number;
  onCommit?: () => void; // ← new, optional
};
