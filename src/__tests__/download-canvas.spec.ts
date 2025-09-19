import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import downloadCanvas from "@/components/utils/download-canvas";

describe("downloadCanvas", () => {
  const originalCreateElement = document.createElement;
  let createUrlSpy: ReturnType<typeof vi.spyOn>;
  let revokeUrlSpy: ReturnType<typeof vi.fn>;
  let restoreRevoke: (() => void) | null = null;

  beforeEach(() => {
    vi.useFakeTimers();
    createUrlSpy = vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:mock");
    if (typeof URL.revokeObjectURL === "function") {
      const spy = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
      revokeUrlSpy = spy as unknown as ReturnType<typeof vi.fn>;
      restoreRevoke = () => spy.mockRestore();
    } else {
      const mock = vi.fn();
      (URL as unknown as { revokeObjectURL: typeof mock }).revokeObjectURL =
        mock;
      revokeUrlSpy = mock;
      restoreRevoke = () => {
        delete (URL as unknown as Record<string, unknown>).revokeObjectURL;
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
    const toBlobMock = vi.fn((cb: BlobCallback) => {
      cb(new Blob(["data"], { type: "image/jpeg" }));
    });
    const clickMock = vi.fn();
    document.createElement = vi.fn((tag: string) => {
      if (tag === "a") {
        const anchor: Partial<HTMLAnchorElement> & {
          _href?: string;
          _download?: string;
        } = {
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
