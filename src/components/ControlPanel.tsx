import React, { JSX, useCallback } from "react";
import { Card, Form } from "react-bootstrap";
import { ControlPanelProps } from "../types/ControlPanelTypes";

export function ControlPanel(props: ControlPanelProps): JSX.Element {
  const { blurVal, setBlurVal, controlName } = props;

  const handleBlurChange = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const value = Number(e.currentTarget.value);
      setBlurVal(value);
    },
    [setBlurVal]
  );

  return (
    <Card className="border-0 bg-body-tertiary mb-3">
      <Card.Body>
        <div className="fw-semibold small mb-2">{controlName}</div>

        <Form.Label className="small d-flex justify-content-between">
          <span>Blur strength</span>
          <span className="text-muted">{blurVal}px</span>
        </Form.Label>
        <Form.Range
          aria-label={`${controlName} Intensity`}
          min={0}
          max={100}
          step={1}
          value={blurVal}
          onChange={handleBlurChange}
        />
      </Card.Body>
    </Card>
  );
}

export default React.memo(ControlPanel);
