import React, { JSX, useCallback, useId, useState } from "react";
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
  } = props;

  const blurId = useId();
  const confId = useId();
  const uiConf = Math.round((confVal ?? 0) * 100);

  // const handleConfChange = useCallback(
  //   async (e: React.ChangeEvent<HTMLInputElement>) => {
  //     const nextPercent = Number(e.currentTarget.value);
  //     const next = Math.max(0, Math.min(100, nextPercent)) / 100;
  //     setThreshVal(next);
  //   },
  //   []
  // );

  return (
    <Card className="border-0 bg-body-tertiary mb-3">
      <Card.Body>
        <div className="fw-bold small mb-2">{controlName}</div>

        {/* Blur strength */}
        <div className="d-flex small align-items-center gap-3 mb-2">
          <Form.Label
            htmlFor={blurId}
            className="mb-0 small text-nowrap"
            style={{ minWidth: 90 }}
          >
            Blur
          </Form.Label>

          <Form.Range
            min={0}
            max={200}
            step={1}
            value={blurVal}
            onChange={async (e) => {
              const val = (Number(e.currentTarget.value));
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
        <div className="d-flex small align-items-center gap-3">
          <Form.Label
            htmlFor={confId}
            className="mb-0 small text-nowrap"
            style={{ minWidth: 90 }}
          >
            Filter
          </Form.Label>

          <Form.Range
            id={confId}
            aria-label={`${controlName} Filter`}
            className="flex-grow-1"
            min={0.0}
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
      </Card.Body>
    </Card>
  );
}

export default React.memo(ControlPanel);
