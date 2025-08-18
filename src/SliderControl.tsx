import { Stack, Form } from "react-bootstrap";

type SliderControlProps = {
  id: string;
  label: string;
  min: number;
  max: number;
  step?: number;
  value: number;
  unit?: string;
  disabled?: boolean;
  onChange: (n: number) => void;
};

export function SliderControl({
  id,
  label,
  min,
  max,
  step = 1,
  value,
  unit,
  disabled,
  onChange,
}: SliderControlProps) {
  return (
    <div className="my-2">
      <Stack direction="horizontal" gap={3} className="align-items-center">
        <Form.Label htmlFor={id} className="mb-0" style={{ minWidth: 160 }}>
          {label}
        </Form.Label>
        <Form.Range
          id={id}
          className="flex-grow-1"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(e) => onChange(Number(e.currentTarget.value))}
          disabled={disabled}
        />
        <span style={{ width: 60, textAlign: "right" }}>{`${value}${
          unit ?? ""
        }`}</span>
      </Stack>
    </div>
  );
}
