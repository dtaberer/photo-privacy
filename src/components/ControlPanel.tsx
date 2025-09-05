import React, { memo, useId } from "react";
import { Card, Form, Badge } from "react-bootstrap";

export type ControlPanelProps = {
  controlName: string;
  count?: number;
  blurVal: number;
  setBlurVal: (v: number) => void;
  confVal: number;
  setThreshVal: (v: number) => void;
  featherVal: number;
  setFeatherVal: (v: number) => void;
  busy?: boolean;
};

function ControlPanel({
  controlName,
  count = 0,
  blurVal,
  setBlurVal,
  confVal,
  setThreshVal,
  featherVal,
  setFeatherVal,
  busy = false,
}: ControlPanelProps) {
  const blurId = useId();
  const confId = useId();
  const featherId = useId();

  return (
    <Card className="shadow-sm border-0 mb-3">
      <Card.Body>
        {/* Title row with count on the right */}
        <div className="d-flex align-items-center justify-content-between mb-2">
          <Card.Title as="h6" className="mb-0">
            {controlName}
          </Card.Title>
          <Badge
            bg="secondary"
            className="bg-opacity-10 text-secondary border border-secondary border-opacity-25 px-2 py-1 small"
          >
            {count}
          </Badge>
        </div>

        {/* Blur slider */}
        <div className="d-flex align-items-center justify-content-between my-2">
          <label htmlFor={blurId} className="mb-0">
            Blur Opacity
          </label>
          <div
            className="d-flex align-items-center"
            style={{ gap: 8, minWidth: 260 }}
          >
            <Form.Range
              id={blurId}
              min={1}
              max={80}
              step={1}
              value={blurVal}
              disabled={busy}
              onChange={(e) => setBlurVal(Number(e.currentTarget.value))}
            />
            <span
              className="text-muted"
              style={{ width: 56, textAlign: "right", whiteSpace: "nowrap" }}
            >
              {blurVal}px
            </span>
          </div>
        </div>

        {/* Filter slider (0–100 UI mapped to 0–1 threshold) */}
        <div className="d-flex align-items-center justify-content-between my-2">
          <label htmlFor={confId} className="mb-0">
            Filter
          </label>
          <div
            className="d-flex align-items-center"
            style={{ gap: 8, minWidth: 260 }}
          >
            <Form.Range
              id={confId}
              min={0}
              max={100}
              step={1}
              value={Math.round(confVal * 100)}
              disabled={busy}
              onChange={(e) => setThreshVal(Number(e.currentTarget.value) / 100)}
            />
            <span
              className="text-muted"
              style={{ width: 56, textAlign: "right", whiteSpace: "nowrap" }}
            >
              {Math.round(confVal * 100)}%
            </span>
          </div>
        </div>

        {/* Feather slider */}
        <div className="d-flex align-items-center justify-content-between my-2">
          <label htmlFor={featherId} className="mb-0">
            Feather
          </label>
          <div
            className="d-flex align-items-center"
            style={{ gap: 8, minWidth: 260 }}
          >
            <Form.Range
              id={featherId}
              min={0}
              max={100}
              step={0.5}
              value={featherVal}
              disabled={busy}
              onChange={(e) => setFeatherVal(Number(e.currentTarget.value))}
            />
            <span
              className="text-muted"
              style={{ width: 56, textAlign: "right", whiteSpace: "nowrap" }}
            >
              {featherVal}px
            </span>
          </div>
        </div>
      </Card.Body>
    </Card>
  );
}

export default memo(ControlPanel);
