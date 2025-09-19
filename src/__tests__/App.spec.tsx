import React from "react";
import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { App } from "@/App";

vi.mock("@/components/Header", () => ({
  __esModule: true,
  default: () => <div data-testid="mock-header">Header</div>,
}));

vi.mock("@/components/PrivacyScrubber", () => ({
  __esModule: true,
  default: () => <div data-testid="mock-scrubber">Scrubber</div>,
}));

describe("App", () => {
  it("renders header and scrubber layout", () => {
    render(<App />);
    expect(screen.getByTestId("mock-header")).toBeInTheDocument();
    expect(screen.getByTestId("mock-scrubber")).toBeInTheDocument();
  });
});
