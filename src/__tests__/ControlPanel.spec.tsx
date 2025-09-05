import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import ControlPanel from "../components/ControlPanel";

describe("ControlPanel", () => {
  it("renders and updates slider values", () => {
    const setBlur = vi.fn();
    const setThresh = vi.fn();
    const setFeather = vi.fn();

    render(
      <ControlPanel
        controlName="Facial Redaction"
        count={3}
        blurVal={40}
        setBlurVal={setBlur}
        confVal={0.05}
        setThreshVal={setThresh}
        featherVal={7}
        setFeatherVal={setFeather}
        busy={false}
      />
    );

    expect(screen.getByText("Facial Redaction")).toBeTruthy();
    expect(screen.getByText(/40\s*px/)).toBeInTheDocument();
    expect(screen.getByText(/5\s*%/)).toBeInTheDocument();
    expect(screen.getByText(/7\S*px/)).toBeInTheDocument();

    const sliders = screen.getAllByRole("slider") as HTMLInputElement[];
    expect(sliders.length).toBeGreaterThanOrEqual(3);
    const [blurSlider, filterSlider, featherSlider] = sliders;

    fireEvent.change(blurSlider!, { target: { value: "41" } });
    expect(setBlur).toHaveBeenCalledWith(41);

    fireEvent.change(filterSlider!, { target: { value: "6" } });
    expect(setThresh).toHaveBeenCalledWith(0.06);

    fireEvent.change(featherSlider!, { target: { value: "8" } });
    expect(setFeather).toHaveBeenCalledWith(8);
  });
});
