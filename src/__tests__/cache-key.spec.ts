import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  basename,
  round3,
  buildDetectorKey,
  hashFile,
  hashImageElement,
} from "@/lib/cache-key";

const digestMock = vi.fn(
  () => Promise.resolve(new ArrayBuffer(0)) as Promise<ArrayBuffer>
);
const originalDigest = globalThis.crypto?.subtle?.digest;

beforeEach(() => {
  vi.resetModules();
  digestMock.mockClear();
  digestMock.mockResolvedValue(new Uint8Array([0xde, 0xad, 0xbe, 0xef]).buffer);
  if (globalThis.crypto?.subtle) {
    vi.spyOn(globalThis.crypto.subtle, "digest").mockImplementation(
      digestMock as unknown as typeof globalThis.crypto.subtle.digest
    );
  } else {
    const subtle = { digest: digestMock };
    vi.stubGlobal("crypto", { subtle });
  }
});

afterEach(() => {
  digestMock.mockReset();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  if (originalDigest) {
    globalThis.crypto!.subtle.digest = originalDigest;
  }
});

describe("cache-key helpers", () => {
  it("extracts basename from URLs", () => {
    expect(basename("https://example.com/models/plates.onnx")).toBe(
      "plates.onnx"
    );
    expect(basename("relative/path/model.onnx")).toBe("model.onnx");
  });

  it("rounds numbers to 3 decimals", () => {
    expect(round3(0.12349)).toBe(0.123);
    expect(round3(0.1235)).toBe(0.124);
  });

  it("builds stable detector keys", () => {
    const key = buildDetectorKey("plate", "https://cdn/model.onnx", {
      modelSize: 640,
      conf: 0.123456,
      iou: 0.654321,
      padRatio: 0.0004,
    });
    expect(key).toBe("plate:model.onnx:640:0.123:0.654:0");
  });

  it("hashes files with subtle crypto", async () => {
    const bytes = new Uint8Array([1, 2, 3]);
    const file = new File([bytes], "x.bin", {
      type: "application/octet-stream",
    });
    if (!("arrayBuffer" in file)) {
      Object.defineProperty(file, "arrayBuffer", {
        value: async () => bytes.buffer,
      });
    }
    const hash = await hashFile(file);
    expect(hash).toBe("deadbeef");
    expect(digestMock).toHaveBeenCalledTimes(1);
  });

  it("hashes data URLs without fetch", async () => {
    const img = document.createElement("img");
    img.src = "data:image/png;base64,AQID"; // 0x01 0x02 0x03
    const hash = await hashImageElement(img);
    expect(hash).toBe("deadbeef");
    expect(digestMock).toHaveBeenCalledTimes(1);
  });

  it("hashes remote images using fetch", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      arrayBuffer: async () => new Uint8Array([4, 5, 6]).buffer,
    });
    vi.stubGlobal("fetch", fetchMock);

    const img = document.createElement("img");
    img.src = "https://example.com/img.png";
    const hash = await hashImageElement(img);
    expect(hash).toBe("deadbeef");
    expect(fetchMock).toHaveBeenCalledWith("https://example.com/img.png", {
      cache: "no-store",
    });
  });
});
