export type ControlPanelProps = {
  blurVal: number;
  onClickChangeHandler: (val: number) => void;
  confVal: number;
  setConfVal: (val: number) => void;
  controlName: string;
  busy?: boolean;
  count: number;
  onCommit?: () => void; // ← new, optional
};
