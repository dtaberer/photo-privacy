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
    <Card className="shadow-sm border-0 mb-3 control-panel-card">
      <Card.Body>
        <div className="d-flex align-items-center justify-content-between mb-2">
          <Card.Title as="p" className="mb-0">
            {controlName}
          </Card.Title>
          <Badge
            bg="secondary"
            className="bg-opacity-10 border border-secondary border-opacity-25 px-2 py-1 small"
          >
            {count}
          </Badge>
        </div>

        <div className="control-row my-2">
          <label htmlFor={blurId} className="mb-0">
            Blur Opacity
          </label>
          <div className="control-slider">
            <Form.Range
              id={blurId}
              min={1}
              max={80}
              step={1}
              value={blurVal}
              disabled={busy}
              onChange={(e) => setBlurVal(Number(e.currentTarget.value))}
              className="form-range themed-range"
              style={{
                // @ts-expect-error CSS custom props for progress fill
                "--min": 1,
                "--max": 80,
                "--value": blurVal,
                "--bs-form-range-track-height": "8px",
                "--bs-form-range-track-bg": "#e2e8f0",
              }}
            />
          </div>
          <span className="value-badge">
            <span aria-hidden className="num">
              {blurVal}
            </span>{" "}
            <span aria-hidden className="unit">
              px
            </span>
            <span className="visually-hidden">{blurVal} px</span>
          </span>
        </div>

        <div className="control-row my-2">
          <label htmlFor={confId} className="mb-0">
            Filter
          </label>
          <div className="control-slider">
            <Form.Range
              id={confId}
              min={0}
              max={100}
              step={1}
              value={Math.round(confVal * 100)}
              disabled={busy}
              onChange={(e) =>
                setThreshVal(Number(e.currentTarget.value) / 100)
              }
              className="form-range themed-range"
              style={{
                // @ts-expect-error CSS custom props for progress fill
                "--min": 0,
                "--max": 100,
                "--value": Math.round(confVal * 100),
                "--bs-form-range-track-height": "8px",
                "--bs-form-range-track-bg": "#e2e8f0",
              }}
            />
          </div>
          <span className="value-badge">
            <span aria-hidden className="num">
              {Math.round(confVal * 100)}
            </span>{" "}
            <span aria-hidden className="unit">
              %
            </span>
            <span className="visually-hidden">
              {Math.round(confVal * 100)} %
            </span>
          </span>
        </div>

        <div className="control-row my-2">
          <label htmlFor={featherId} className="mb-0">
            Feather
          </label>
          <div className="control-slider">
            <Form.Range
              id={featherId}
              min={0}
              max={100}
              step={0.5}
              value={featherVal}
              disabled={busy}
              onChange={(e) => setFeatherVal(Number(e.currentTarget.value))}
              className="form-range themed-range"
              style={{
                // @ts-expect-error CSS custom props for progress fill
                "--min": 0,
                "--max": 100,
                "--value": featherVal,
                "--bs-form-range-track-bg": "#e2e8f0",
              }}
            />
          </div>
          <span className="value-badge">
            <span aria-hidden className="num">
              {Math.round(featherVal)}
            </span>{" "}
            <span aria-hidden className="unit">
              px
            </span>
            <span className="visually-hidden">{Math.round(featherVal)}px</span>
          </span>
        </div>
      </Card.Body>
    </Card>
  );
}

export default memo(ControlPanel);
