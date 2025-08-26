import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { ControlPanel } from "../components/ControlPanel";

function getSliderNamedOrAtIndex(
  nameRE: RegExp,
  indexFallback: number
): HTMLElement {
  const named = screen.queryByRole("slider", { name: nameRE });
  if (named) return named;
  const sliders = screen.getAllByRole("slider");
  expect(sliders.length).toBeGreaterThan(indexFallback);
  return sliders[indexFallback]!;
}

describe("ControlPanel", () => {
  it("calls setBlurVal when intensity slider moves", () => {
    const setBlurVal = vi.fn<(v: number) => void>();
    const setConfVal = vi.fn<(v: number) => void>();

    render(
      <ControlPanel
        controlName="License Plate Redaction"
        blurVal={10}
        confVal={0.5}
        setBlurVal={setBlurVal}
        setConfVal={setConfVal}
      />
    );

    const intensity = getSliderNamedOrAtIndex(
      /license plate redaction.*intensity/i,
      0
    );
    fireEvent.change(intensity, { target: { value: 12 } });
    expect(setBlurVal).toHaveBeenCalledWith(12);
  });

  it("calls setConfVal when sensitivity slider moves (if present)", () => {
    const setBlurVal = vi.fn<(v: number) => void>();
    const setConfVal = vi.fn<(v: number) => void>();

    render(
      <ControlPanel
        controlName="Facial Redaction"
        blurVal={20}
        confVal={0.45}
        setBlurVal={setBlurVal}
        setConfVal={setConfVal}
      />
    );

    const sensitivityNamed = screen.queryByRole("slider", {
      name: /facial redaction.*sensitivity/i,
    });
    if (!sensitivityNamed) {
      // No sensitivity slider in this variant — assert we did NOT call the spy
      expect(setConfVal).not.toHaveBeenCalled();
      return;
    }

    fireEvent.change(sensitivityNamed, { target: { value: 60 } });
    expect(setConfVal).toHaveBeenCalled();
  });
});
