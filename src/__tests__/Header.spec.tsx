import React from "react";
import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import Header from "@/components/Header";

describe("Header", () => {
  it("renders hero headline and subtitle", () => {
    render(<Header />);
    expect(
      screen.getByRole("heading", { name: /photo privacy scrubber/i })
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Redact Faces • Redact Plates • Strip EXIF/i)
    ).toBeInTheDocument();
    const hero = screen
      .getByRole("heading", { name: /photo privacy scrubber/i })
      .closest(".pps-hero");
    expect(hero).toBeTruthy();
    expect((hero as HTMLElement | null)?.style.backgroundImage).toContain(
      "bubble-blower"
    );
  });
});
