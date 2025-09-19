import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MockInstance } from "vitest";
import downloadCanvas from "@/components/utils/download-canvas";

type URLStatic = {
  createObjectURL: typeof URL.createObjectURL;
  revokeObjectURL?: (url: string) => void;
};

describe("downloadCanvas", () => {
  const originalCreateElement = document.createElement;
  const urlStatic = URL as unknown as URLStatic;

  let createUrlSpy: MockInstance<(obj: Blob | MediaSource) => string>;
  let revokeUrlSpy: MockInstance<(url: string) => void>;
  let restoreRevoke: (() => void) | null = null;

  beforeEach(() => {
    vi.useFakeTimers();
    createUrlSpy = vi
      .spyOn(urlStatic, "createObjectURL")
      .mockReturnValue("blob:mock");

    if (typeof urlStatic.revokeObjectURL === "function") {
      const spy = vi
        .spyOn(urlStatic as Required<URLStatic>, "revokeObjectURL")
        .mockImplementation(() => {});
      revokeUrlSpy = spy;
      restoreRevoke = () => spy.mockRestore();
    } else {
      const mock = vi.fn<(url: string) => void>((url) => {
        void url;
      });
      urlStatic.revokeObjectURL = mock;
      revokeUrlSpy = mock;
      restoreRevoke = () => {
        delete urlStatic.revokeObjectURL;
      };
    }
  });

  afterEach(() => {
    vi.useRealTimers();
    createUrlSpy.mockRestore();
    restoreRevoke?.();
    document.createElement = originalCreateElement;
    restoreRevoke = null;
  });

  it("creates download link from canvas blob", () => {
    const toBlobMock = vi.fn<(cb: BlobCallback) => void>((cb) => {
      cb(new Blob(["data"], { type: "image/jpeg" }));
    });
    const clickMock = vi.fn();
    document.createElement = vi.fn((tag: string) => {
      if (tag === "a") {
        const anchor: Partial<HTMLAnchorElement> & { _href?: string; _download?: string } = {
          click: clickMock,
          set href(value: string) {
            this._href = value;
          },
          get href() {
            return this._href ?? "";
          },
          set download(value: string) {
            this._download = value;
          },
          get download() {
            return this._download ?? "";
          },
        };
        return anchor as HTMLAnchorElement;
      }
      return originalCreateElement.call(document, tag);
    }) as unknown as typeof document.createElement;

    const canvas = document.createElement("canvas");
    canvas.toBlob = toBlobMock;

    downloadCanvas(canvas, "output.jpg", "image/jpeg", 0.8);

    expect(toBlobMock).toHaveBeenCalled();
    expect(createUrlSpy).toHaveBeenCalled();
    expect(clickMock).toHaveBeenCalled();

    vi.runOnlyPendingTimers();
    expect(revokeUrlSpy).toHaveBeenCalledWith("blob:mock");
  });

  it("no-ops when canvas missing", () => {
    expect(() => downloadCanvas(null)).not.toThrow();
  });
});
