// src/components/CheckboxOption.tsx
import React, { memo, type Dispatch, type SetStateAction } from "react";
import { Form } from "react-bootstrap";

/**
 * Checkbox form control with accessible label and optional description.
 * Memoized to prevent unnecessary rerenders.
 */
export type CheckboxOptionProps = {
  id: string;
  label: string;
  checked: boolean;
  description?: string;
  disabled?: boolean;
  className?: string;
  inline?: boolean;
  /** Preferred: change handler receiving the next checked value. */
  onChange?: (checked: boolean) => void;
  /** Back-compat: setState-like handler; used if `onChange` is not provided. */
  onChangeHandler?: Dispatch<SetStateAction<boolean>>;
};

// Alias for legacy imports that referenced the pluralized name
export type CheckboxOptionsProps = CheckboxOptionProps;

function CheckboxOptionView({
  id,
  label,
  checked,
  description,
  disabled = false,
  className,
  inline,
  onChange,
  onChangeHandler,
}: CheckboxOptionProps) {
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const next = e.currentTarget.checked;
    if (onChange) onChange(next);
    else if (onChangeHandler) onChangeHandler(next);
  };

  return (
    <Form.Group controlId={id} className={className}>
      <Form.Check
        id={id}
        type="checkbox"
        checked={checked}
        label={label}
        disabled={disabled}
        onChange={handleChange}
        inline={inline}
      />
      {description ? (
        <Form.Text muted className="d-block">
          {description}
        </Form.Text>
      ) : null}
    </Form.Group>
  );
}

// Only rerender when visuals/behavior change
const areEqual = (
  prev: Readonly<CheckboxOptionProps>,
  next: Readonly<CheckboxOptionProps>
): boolean =>
  prev.id === next.id &&
  prev.label === next.label &&
  prev.checked === next.checked &&
  prev.description === next.description &&
  prev.disabled === next.disabled &&
  prev.className === next.className &&
  prev.inline === next.inline;

export const CheckboxOption = memo(CheckboxOptionView, areEqual);
export default CheckboxOption;
