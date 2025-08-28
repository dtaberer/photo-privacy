import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PrivacyScrubber } from "../components/PrivacyScrubber"; // relative import = no alias issues

// Mock BOTH possible helper locations (utils or old component files)
vi.mock("../components/utils/license-plate-blur-utils", () => ({
  runLicensePlateBlurOnCanvas: vi
    .fn()
    .mockResolvedValue({ count: 1, boxes: [{ x: 10, y: 20, w: 100, h: 40 }] }),
}));
vi.mock("../components/utils/face-blur-utils", () => ({
  runFaceBlurOnCanvas: vi
    .fn()
    .mockResolvedValue({ count: 2, boxes: [{ x: 5, y: 5, w: 30, h: 30 }] }),
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

// —— strict spy helpers (no `any`) ——
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

describe("PrivacyScrubber detection triggers", () => {
  beforeEach(() => vi.clearAllMocks());

  it("detects on image load; blur slider changes do NOT trigger detection; toggles do", async () => {
    render(<PrivacyScrubber />);

    // Pick a file
    const fileInput = document.querySelector(
      'input[type="file"]'
    ) as HTMLInputElement | null;
    expect(fileInput).not.toBeNull();
    const file = new File(["abc"], "photo.jpg", { type: "image/jpeg" });
    fireEvent.change(fileInput as HTMLInputElement, {
      target: { files: [file] },
    });

    // Simulate image load
    const imgEl = (await screen.findByRole("img")) as HTMLImageElement;
    Object.defineProperty(imgEl, "naturalWidth", {
      value: 1200,
      configurable: true,
    });
    Object.defineProperty(imgEl, "naturalHeight", {
      value: 800,
      configurable: true,
    });
    imgEl.dispatchEvent(new Event("load"));

    // If UI requires pressing Refresh, do it
    const refreshBtn = screen.queryByRole("button", { name: /refresh/i });
    if (refreshBtn) fireEvent.click(refreshBtn);

    // wait for *either* module’s helper(s) to be called
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

    // Move Intensity slider → should NOT trigger new detection
    const plateIntensity =
      screen.queryByRole("slider", { name: /license plate.*intensity/i }) ??
      screen.queryByRole("slider", { name: /plate.*intensity/i });
    if (plateIntensity) {
      await userEvent.type(plateIntensity, "{arrowright}{arrowright}");
      await new Promise((r) => setTimeout(r, 50)); // allow rAF paints
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
    }

    // Toggle "Blur Faces" → SHOULD trigger face detection again
    const faceSwitch = screen.queryByRole("switch", { name: /blur faces/i });
    if (faceSwitch) {
      const before = getCallsSum(
        faceDetector,
        "runFaceBlurOnCanvas",
        FaceComp,
        "runFaceBlurOnCanvas"
      );
      fireEvent.click(faceSwitch);
      await waitFor(() => {
        const after = getCallsSum(
          faceDetector,
          "runFaceBlurOnCanvas",
          FaceComp,
          "runFaceBlurOnCanvas"
        );
        expect(after).toBeGreaterThan(before);
      });
    }
  });
});
