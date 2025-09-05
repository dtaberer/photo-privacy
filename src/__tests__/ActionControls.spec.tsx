import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import ActionControls from "../components/ActionControls";

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

    const refreshBtn = screen.getByLabelText(/refresh/i);
    const downloadBtn = screen.getByLabelText(/download/i);

    fireEvent.click(refreshBtn);
    fireEvent.click(downloadBtn);

    expect(onRefresh).toHaveBeenCalled();
    expect(onDownload).toHaveBeenCalled();
  });
});
