import { Card, Form } from "react-bootstrap";

type ControlPanelProps = {
  blurVal: number;
  setBlurVal: (val: number) => void;
  confVal: number;
  setConfVal: (val: number) => void;
  controlName: string;
};

export function ControlPanel({
  blurVal,
  setBlurVal,
  controlName,
}: ControlPanelProps) {
  return (
    <Card className="border-0 bg-body-tertiary mb-3">
      <Card.Body>
        <div className="fw-semibold small mb-2">{controlName}</div>

        <Form.Label className="small d-flex justify-content-between">
          <span>Blur strength</span>
          <span className="text-muted">{blurVal}px</span>
        </Form.Label>
        <Form.Range
          min={0}
          max={30}
          step={0.11}
          value={blurVal}
          onChange={(e) => setBlurVal(Number(e.currentTarget.value))}
        />
      </Card.Body>
    </Card>
  );
}
