// src/components/SliderControl.tsx
import React, { memo, useCallback } from "react";
import { Form, Spinner } from "react-bootstrap";

/**
 * Range slider with label, live value, and optional description.
 * Memoized to avoid rerenders when unrelated parent state changes.
 */
export type SliderControlProps = {
  id: string;
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  unit?: string;
  description?: string;
  disabled?: boolean;
  busy?: boolean; // shows a tiny spinner next to the live value
  className?: string;
  /** Preferred: change handler receiving the next numeric value. */
  onChange?: (value: number) => void;
  /** Back-compat: legacy handler name used elsewhere. */
  onChangeHandler?: (value: number) => void;
};

function SliderControlView({
  id,
  label,
  value,
  min,
  max,
  step = 1,
  unit,
  description,
  disabled = false,
  busy = false,
  className,
  onChange,
  onChangeHandler,
}: SliderControlProps) {
  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const next = Number(e.currentTarget.value);
      if (!Number.isFinite(next)) return; // ignore invalid input
      if (onChange) onChange(next);
      else if (onChangeHandler) onChangeHandler(next);
    },
    [onChange, onChangeHandler]
  );

  const clamped = Math.min(Math.max(value, min), max); // guard UI when value falls outside bounds

  return (
    <Form.Group controlId={id} className={className}>
      <div className="d-flex justify-content-between align-items-end">
        {/* IMPORTANT: do not pass htmlFor when using controlId to avoid RB warning */}
        <Form.Label className="mb-1">{label}</Form.Label>
        <div className="d-flex align-items-center gap-2" aria-live="polite">
          <span>{`${clamped}${unit ?? ""}`}</span>
          {busy ? (
            <Spinner
              animation="border"
              size="sm"
              role="status"
              aria-label="loading"
            />
          ) : null}
        </div>
      </div>

      {description ? (
        <Form.Text muted className="d-block mb-2">
          {description}
        </Form.Text>
      ) : null}

      <Form.Range
        id={id}
        min={min}
        max={max}
        step={step}
        value={clamped}
        onChange={handleChange}
        disabled={disabled}
      />
    </Form.Group>
  );
}

// rerender only when visuals/behavior change
const areEqual = (
  prev: Readonly<SliderControlProps>,
  next: Readonly<SliderControlProps>
): boolean =>
  prev.id === next.id &&
  prev.label === next.label &&
  prev.value === next.value &&
  prev.min === next.min &&
  prev.max === next.max &&
  prev.step === next.step &&
  prev.unit === next.unit &&
  prev.description === next.description &&
  prev.disabled === next.disabled &&
  prev.busy === next.busy &&
  prev.className === next.className;

export default memo(SliderControlView, areEqual);
