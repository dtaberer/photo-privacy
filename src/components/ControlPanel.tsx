import React, { JSX, useCallback, useId } from "react";
import { Card, Form } from "react-bootstrap";
import { ControlPanelProps } from "../types/ControlPanelTypes";

export function ControlPanel(props: ControlPanelProps): JSX.Element {
  const {
    blurVal,
    setBlurVal,
    confVal,
    setConfVal,
    controlName,
    busy,
    onCommit,
  } = props;
  const blurId = useId();
  const confId = useId();

  const uiConf = Math.round((confVal ?? 0) * 100);

  const handleConfChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const nextPercent = Number(e.currentTarget.value);
      const next = Math.max(0, Math.min(100, nextPercent)) / 100;
      setConfVal(next);
    },
    [setConfVal]
  );

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
            max={100}
            step={1}
            value={blurVal}
            onChange={(e) => setBlurVal(Number(e.currentTarget.value))}
            onPointerUp={() => onCommit?.()} // ← call once when user releases
            aria-label="Blur strength"
            className="flex-grow-1"
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
            Sensitivity
          </Form.Label>

          <Form.Range
            id={confId}
            aria-label={`${controlName} Sensitivity`}
            className="flex-grow-1"
            min={0}
            max={100}
            step={1}
            value={uiConf}
            onChange={handleConfChange}
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
