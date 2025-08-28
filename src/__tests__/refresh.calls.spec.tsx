import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { PrivacyScrubber } from "../components/PrivacyScrubber";

// Mock BOTH possible helper locations
vi.mock("../components/utils/license-plate-blur-utils", () => ({
  runLicensePlateBlurOnCanvas: vi.fn().mockResolvedValue({ count: 1 }),
}));
vi.mock("../components/utils/face-blur-utils", () => ({
  runFaceBlurOnCanvas: vi.fn().mockResolvedValue({ count: 2 }),
}));
vi.mock("../components/LicensePlateBlur", () => ({
  runLicensePlateBlurOnCanvas: vi.fn().mockResolvedValue({ count: 1 }),
}));
vi.mock("../components/FaceBlur", () => ({
  runFaceBlurOnCanvas: vi.fn().mockResolvedValue({ count: 2 }),
}));

import * as faceDetector from "../components/utils/face-blur-utils";
import * as plateDetector from "../components/utils/license-plate-blur-utils";
import * as PlateComp from "../components/LicensePlateBlur";
import * as FaceComp from "../components/FaceBlur";

// URL stubs
const createObjectURL = vi.fn<(b: Blob | MediaSource) => string>(
  () => "blob:test"
);
const revokeObjectURL = vi.fn<(u: string) => void>(() => {});
Object.defineProperty(globalThis, "URL", {
  value: { createObjectURL, revokeObjectURL },
  writable: true,
});

// strict spy helpers
type Spy = ReturnType<typeof vi.fn>;
function hasMock(obj: unknown): obj is { mock: { calls: unknown[] } } {
  return typeof obj === "function" && !!(obj as { mock?: unknown }).mock;
}
function getSpy(mod: unknown, key: string): Spy | null {
  if (!mod || typeof mod !== "object") return null;
  const v = (mod as Record<string, unknown>)[key];
  return hasMock(v) ? (v as Spy) : null;
}
function getCallsSum(
  modA: unknown,
  keyA: string,
  modB: unknown,
  keyB: string
): number {
  const a = getSpy(modA, keyA);
  const b = getSpy(modB, keyB);
  return (a?.mock.calls.length ?? 0) + (b?.mock.calls.length ?? 0);
}

describe("PrivacyScrubber refresh flow", () => {
  beforeEach(() => vi.clearAllMocks());

  it("calls plate then face helpers after image load and (if present) refresh", async () => {
    render(<PrivacyScrubber />);

    const fileInput = document.querySelector(
      'input[type="file"]'
    ) as HTMLInputElement | null;
    expect(fileInput).not.toBeNull();
    const file = new File(["abc"], "photo.jpg", { type: "image/jpeg" });
    fireEvent.change(fileInput as HTMLInputElement, {
      target: { files: [file] },
    });

    const imgEl = (await screen.findByRole("img")) as HTMLImageElement;
    Object.defineProperty(imgEl, "naturalWidth", {
      value: 800,
      configurable: true,
    });
    Object.defineProperty(imgEl, "naturalHeight", {
      value: 600,
      configurable: true,
    });
    imgEl.dispatchEvent(new Event("load"));

    const refreshBtn = screen.queryByRole("button", { name: /refresh/i });
    if (refreshBtn) fireEvent.click(refreshBtn);

    await waitFor(() => {
      const plateCalls = getCallsSum(
        plateDetector,
        "runLicensePlateBlurOnCanvas",
        PlateComp,
        "runLicensePlateBlurOnCanvas"
      );
      const faceCalls = getCallsSum(
        faceDetector,
        "runFaceBlurOnCanvas",
        FaceComp,
        "runFaceBlurOnCanvas"
      );
      expect(plateCalls).toBeGreaterThanOrEqual(1);
      expect(faceCalls).toBeGreaterThanOrEqual(1);
    });
  });
});
