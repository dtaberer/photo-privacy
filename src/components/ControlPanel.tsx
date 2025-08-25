// src/components/ControlPanel.tsx
import { Card, Form } from "react-bootstrap";

export type ControlPanelProps = {
  onBlurChange?: (val: number) => void; // reserved for future use
  onConfChange?: (val: number) => void; // reserved for future use
  blurVal: number;
  confVal: number; // reserved for future use
  controlName: string;
};

export function ControlPanel({
  onBlurChange,
  onConfChange,
  blurVal,
  controlName,
  confVal,
}: ControlPanelProps) {
  // why: keep label at left and slider/value in a single row using RB utilities
  const rangeId = `${controlName.replace(/\s+/g, "-").toLowerCase()}-intensity`;
  const sensId = `${controlName
    .replace(/\s+/g, "-")
    .toLowerCase()}-sensitivity`;

  return (
    <Card className="border-0 bg-body-tertiary mb-3">
      <Card.Body>
        <div className="fw-bold small mb-2">{controlName}</div>

        <div className="d-flex align-items-center gap-3">
          <Form.Label
            htmlFor={rangeId}
            className="mb-0 small text-secondary"
            style={{ minWidth: 140 }}
          >
            Intensity
          </Form.Label>

          <Form.Range
            id={rangeId}
            className="flex-grow-1"
            min={0}
            max={100}
            step={1}
            value={blurVal}
            onChange={(e) => onBlurChange?.(Number(e.currentTarget.value))}
          />

          <div
            className="small text-muted"
            style={{ width: 56, textAlign: "right" }}
          >
            {blurVal}px
          </div>
        </div>
        <div className="d-flex align-items-center gap-3">
          <Form.Label
            htmlFor={sensId}
            className="mb-0 small text-secondary"
            style={{ minWidth: 140 }}
          >
            Sensitivity
          </Form.Label>

          <Form.Range
            id={sensId}
            className="flex-grow-1"
            min={0}
            max={100}
            step={1}
            value={Math.round(confVal * 100)}
            onChange={(e) =>
              onConfChange?.(Number(e.currentTarget.value) / 100)
            }
          />

          <div
            className="small text-muted"
            style={{ width: 56, textAlign: "right" }}
          >
            {Math.round(confVal * 100)}%
          </div>
        </div>
      </Card.Body>
    </Card>
  );
}
