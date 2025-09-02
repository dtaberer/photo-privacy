import React, { JSX, useId } from "react";
import { Card, Form } from "react-bootstrap";
import { ControlPanelProps } from "../types/ControlPanelTypes";

export function ControlPanel(props: ControlPanelProps): JSX.Element {
  const {
    blurVal,
    setBlurVal,
    setThreshVal,
    confVal,
    controlName,
    busy,
    featherVal,
    setFeatherVal,
  } = props;

  const confId = useId();
  const uiConf = Math.round((confVal ?? 0) * 100);

  return (
    <Card className="border-0 bg-body-tertiary mb-3">
      <Card.Body>
        <div className="fw-bold mb-4">{controlName}</div>

        {/* Blur strength */}
        <div className="d-flex align-items-center gap-2 mt-2">
          <label className="text-nowrap mb-0" style={{ width: 110 }}>
            Blur Opacity
          </label>

          <Form.Range
            min={0}
            max={80}
            step={1}
            value={blurVal}
            onChange={async (e) => {
              const val = Number(e.currentTarget.value);
              setBlurVal(val);
            }}
            aria-label="Blur strength"
            className="flex-grow-1"
            disabled={busy}
          />

          <span className="text-muted small text-end" style={{ minWidth: 56 }}>
            {blurVal}px
          </span>
        </div>

        {/* Sensitivity */}
        <div className="d-flex align-items-center gap-2 mt-2">
          <label className="text-nowrap mb-0" style={{ width: 110 }}>
            Filter
          </label>

          <Form.Range
            id={confId}
            aria-label={`${controlName} Filter`}
            className="flex-grow-1"
            min={0.02}
            max={1}
            step={0.001}
            value={confVal}
            onChange={(e) => {
              const val = Number(e.currentTarget.value);
              setThreshVal(val);
            }}
            disabled={busy}
          />
          <span className="text-muted small text-end" style={{ minWidth: 56 }}>
            {uiConf}%
          </span>
        </div>

        {/* Feather slider (optional) */}
        {typeof featherVal === "number" && setFeatherVal && (
          <div className="d-flex align-items-center gap-2 mt-2">
            <label className="text-nowrap mb-0" style={{ width: 110 }}>
              Feather
            </label>
            <input
              type="range"
              min={0}
              max={30}
              step={1}
              value={featherVal}
              onChange={(e) => setFeatherVal(Number(e.currentTarget.value))}
              className="form-range flex-grow-1"
              disabled={busy}
            />
            <span style={{ width: 42, textAlign: "right" }}>
              {featherVal}px
            </span>
          </div>
        )}
      </Card.Body>
    </Card>
  );
}

export default React.memo(ControlPanel);
