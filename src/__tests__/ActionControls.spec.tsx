import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import ActionControls from "@/components/ActionControls";
import { StepStates, StepsEnum } from "@/components/demo/useDemo";

describe("ActionControls", () => {
  it("fires callbacks on click", () => {
    const onRefresh = vi.fn();
    const onDownload = vi.fn();
    render(
      <ActionControls
        busy={false}
        onClickRefreshHandler={onRefresh}
        onClickDownloadHandler={onDownload}
      />
    );

    const refreshBtn = screen.getByLabelText(/refresh|scrub image/i);
    const downloadBtn = screen.getByLabelText(/download/i);

    fireEvent.click(refreshBtn);
    fireEvent.click(downloadBtn);

    expect(onRefresh).toHaveBeenCalled();
    expect(onDownload).toHaveBeenCalled();
  });

  it("disables buttons when busy and shows spinner", () => {
    render(
      <ActionControls
        busy
        onClickRefreshHandler={vi.fn()}
        onClickDownloadHandler={vi.fn()}
      />
    );

    const scrubBtn = screen.getByLabelText(/scrub image/i);
    expect(scrubBtn.querySelector(".spinner-border")).toBeTruthy();
    expect(scrubBtn).toBeDisabled();
    expect(screen.getByLabelText(/download/i)).toBeDisabled();
  });

  it("renders demo overlay and advances steps when continue is clicked", () => {
    const onNext = vi.fn();
    const steps = new Array(8).fill(0);
    steps[0] = 1; // Scrub active
    act(() => {
      render(
        <ActionControls
          busy={false}
          onClickRefreshHandler={vi.fn()}
          onClickDownloadHandler={vi.fn()}
          demoStepsArray={steps}
          onDemoStepNext={onNext}
        />
      );
    });

    const tooltipText = screen.getByText(/After loading your image, click the Scrub Image button/i);
    expect(tooltipText).toBeInTheDocument();

    act(() => {
      fireEvent.click(screen.getByRole("button", { name: /continue/i }));
    });
    expect(onNext).toHaveBeenCalledTimes(1);
  });

  it("shows download helper when download step active", () => {
    const steps = new Array(8).fill(0);
    steps[StepsEnum.Download] = StepStates.Active;
    const onNext = vi.fn();
    act(() => {
      render(
        <ActionControls
          busy={false}
          onClickRefreshHandler={vi.fn()}
          onClickDownloadHandler={vi.fn()}
          demoStepsArray={steps}
          onDemoStepNext={onNext}
        />
      );
    });

    expect(screen.getByText(/Click to download your redacted image/i)).toBeInTheDocument();
    act(() => {
      fireEvent.click(screen.getByRole("button", { name: /got it!/i }));
    });
    expect(onNext).toHaveBeenCalled();
  });
});
