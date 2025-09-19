import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import Demo from "@/components/Demo";

describe("Demo button", () => {
  it("invokes onClick when enabled", () => {
    const onClick = vi.fn();
    render(<Demo onClick={onClick} />);
    const button = screen.getByRole("button", { name: /demo/i });
    fireEvent.click(button);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("respects disabled prop", () => {
    const onClick = vi.fn();
    render(<Demo onClick={onClick} disabled />);
    const button = screen.getByRole("button", { name: /demo/i });
    expect(button).toBeDisabled();
    fireEvent.click(button);
    expect(onClick).not.toHaveBeenCalled();
  });
});
