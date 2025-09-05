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

        <div className="d-flex align-items-center justify-content-between my-2">
          <label htmlFor={blurId} className="mb-0">
            Blur Opacity
          </label>
          <div className="d-flex align-items-center control-inner">
            <Form.Range
              id={blurId}
              min={1}
              max={80}
              step={1}
              value={blurVal}
              disabled={busy}
              onChange={(e) => setBlurVal(Number(e.currentTarget.value))}
            />
            <span className="text-muted value-label">
              {blurVal}px
            </span>
          </div>
        </div>

        <div className="d-flex align-items-center justify-content-between my-2">
          <label htmlFor={confId} className="mb-0">
            Filter
          </label>
          <div className="d-flex align-items-center control-inner">
            <Form.Range
              id={confId}
              min={0}
              max={100}
              step={1}
              value={Math.round(confVal * 100)}
              disabled={busy}
              onChange={(e) => setThreshVal(Number(e.currentTarget.value) / 100)}
            />
            <span className="text-muted value-label">
              {Math.round(confVal * 100)}%
            </span>
          </div>
        </div>

        <div className="d-flex align-items-center justify-content-between my-2">
          <label htmlFor={featherId} className="mb-0">
            Feather
          </label>
          <div className="d-flex align-items-center control-inner">
            <Form.Range
              id={featherId}
              min={0}
              max={100}
              step={0.5}
              value={featherVal}
              disabled={busy}
              onChange={(e) => setFeatherVal(Number(e.currentTarget.value))}
            />
            <span className="text-muted value-label">
              {featherVal}px
            </span>
          </div>
        </div>
      </Card.Body>
    </Card>
  );
}

export default memo(ControlPanel);
