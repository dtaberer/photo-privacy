import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Tensor } from "onnxruntime-web";

class FakeTensor {
  constructor(
    public type: string,
    public data: Float32Array,
    public dims: number[]
  ) {}
}

const fetchMock = vi.fn();

const makeImageData = (w: number, h: number): ImageData => {
  const data = new Uint8ClampedArray(w * h * 4).fill(128);
  if (typeof ImageData !== "undefined") {
    return new ImageData(data, w, h);
  }
  return { width: w, height: h, data } as unknown as ImageData;
};

async function withFaceConstants<T>(
  overrides: Record<string, number | boolean>,
  fn: () => Promise<T>
): Promise<T> {
  const { FaceBlurConstants } = await import("@/config/constants");
  const original: Record<string, number | boolean> = {};
  for (const key of Object.keys(overrides)) {
    const value = overrides[key];
    if (typeof value === "undefined") continue;
    original[key] = FaceBlurConstants[key as keyof typeof FaceBlurConstants] as
      | number
      | boolean;
    (FaceBlurConstants as unknown as Record<string, number | boolean>)[key] =
      value;
  }
  try {
    return await fn();
  } finally {
    for (const key of Object.keys(original)) {
      (FaceBlurConstants as unknown as Record<string, number | boolean>)[key] =
        original[key] as number | boolean;
    }
  }
}

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  vi.unstubAllGlobals();
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("runtime/face-detect", () => {
  it("loads ONNX model, reuses session, and decodes fallback outputs", async () => {
    const runMock = vi.fn().mockResolvedValue({
      output: new FakeTensor(
        "float32",
        new Float32Array([0.05, 0.1, 0.95, 0.95, 5, 5]),
        [1, 1, 6]
      ),
    });

    vi.doMock("onnxruntime-web", () => ({
      __esModule: true,
      Tensor: FakeTensor,
    }));

    const createOrtSession = vi.fn().mockResolvedValue({
      inputNames: ["images"],
      outputNames: ["output"],
      inputMetadata: { images: { dimensions: [1, 3, 320, 320] } },
      run: runMock,
    });

    vi.doMock("@/ort-setup", () => ({
      __esModule: true,
      createOrtSession,
    }));

    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      statusText: "OK",
      headers: {
        get: (key: string) =>
          key.toLowerCase() === "content-type"
            ? "application/octet-stream"
            : null,
      },
      arrayBuffer: async () => new ArrayBuffer(16 * 1024),
    });

    const mod = await import("@/runtime/face-detect");
    const { loadFaceModel, detectFaces } = mod;

    await withFaceConstants(
      { PREFILTER_MIN_SIDE_RATIO: 0, PAD_SMALL_SIDE: 0, PAD_LARGE_SIDE: 0 },
      async () => {
        const session = await loadFaceModel("https://example.com/model.onnx");
        expect(session).toBeDefined();
        expect(fetchMock).toHaveBeenCalledTimes(1);
        expect(createOrtSession).toHaveBeenCalledTimes(1);

        const img = makeImageData(20, 20);
        const boxes = await detectFaces(img, 0.5);

        expect(runMock).toHaveBeenCalledTimes(1);
        const [feeds] = runMock.mock.calls[0] ?? [];
        const tensor = feeds?.images as FakeTensor | undefined;
        expect(tensor).toBeInstanceOf(FakeTensor);
        expect(tensor?.dims).toEqual([1, 3, 320, 320]);
        expect(boxes).toHaveLength(1);
        const [box] = boxes;
        if (box) {
          expect(box.w).toBeGreaterThan(1);
          expect(box.h).toBeGreaterThan(1);
        }

        const again = await loadFaceModel("https://example.com/model.onnx");
        expect(again).toBe(session);
        expect(fetchMock).toHaveBeenCalledTimes(1);
      }
    );
  });

  it("throws when model fetch fails", async () => {
    vi.doMock("onnxruntime-web", () => ({
      __esModule: true,
      Tensor: FakeTensor,
    }));

    const createOrtSession = vi.fn();
    vi.doMock("@/ort-setup", () => ({
      __esModule: true,
      createOrtSession,
    }));

    fetchMock.mockResolvedValue({
      ok: false,
      status: 404,
      statusText: "Not Found",
      text: async () => "missing",
    });

    const { loadFaceModel } = await import("@/runtime/face-detect");
    await expect(
      loadFaceModel("https://example.com/missing.onnx")
    ).rejects.toThrow(/Model HTTP 404/);
    expect(createOrtSession).not.toHaveBeenCalled();
  });

  it("rejects when model returns text content", async () => {
    vi.doMock("onnxruntime-web", () => ({
      __esModule: true,
      Tensor: FakeTensor,
    }));

    const createOrtSession = vi.fn();
    vi.doMock("@/ort-setup", () => ({
      __esModule: true,
      createOrtSession,
    }));

    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      statusText: "OK",
      headers: {
        get: (key: string) =>
          key.toLowerCase() === "content-type" ? "text/html" : null,
      },
      text: async () => "<!doctype html><p>oops</p>",
      arrayBuffer: async () => new ArrayBuffer(16 * 1024),
    });

    const { loadFaceModel } = await import("@/runtime/face-detect");
    await expect(
      loadFaceModel("https://example.com/not-a-model")
    ).rejects.toThrow(/Bad content-type/);
    expect(createOrtSession).not.toHaveBeenCalled();
  });

  it("decodes DFL tensors correctly", async () => {
    vi.doMock("onnxruntime-web", () => ({
      __esModule: true,
      Tensor: FakeTensor,
    }));

    const { decodeYoloOutput } = await import("@/runtime/face-detect");

    const target = 32;
    const regMax = 4;
    const expectedN =
      Math.round(target / 8) ** 2 +
      Math.round(target / 16) ** 2 +
      Math.round(target / 32) ** 2;
    const strideE = 4 * regMax + 1;
    const data = new Float32Array(expectedN * strideE);

    const set = (i: number, k: number, value: number) => {
      data[i * strideE + k] = value;
    };

    set(0, 0, 8);
    set(0, 4, 8);
    set(0, 8 + 1, 8);
    set(0, 12 + 1, 8);
    set(0, 16, 6);

    const tensor = new FakeTensor("float32", data, [1, expectedN, strideE]);
    const info = {
      target,
      scale: 0.5,
      padX: 4,
      padY: 2,
      resizedW: target,
      resizedH: target,
    };

    const boxes = decodeYoloOutput(
      tensor as unknown as Tensor,
      info,
      200,
      150,
      0.9
    );
    expect(boxes).toHaveLength(1);
    const [box] = boxes;
    if (box) {
      expect(box.score).toBeGreaterThan(0.9);
      expect(box.w).toBeGreaterThan(0);
      expect(box.h).toBeGreaterThan(0);
    }
  });

  it("applies TTA flip and fuses overlapping clusters", async () => {
    const runMock = vi
      .fn()
      .mockResolvedValueOnce({
        output: new FakeTensor(
          "float32",
          new Float32Array([
            0.1, 0.4, 0.5, 0.8, 4, 4, 0.55, 0.35, 0.85, 0.75, 2, 2,
          ]),
          [1, 2, 6]
        ),
      })
      .mockResolvedValueOnce({
        output: new FakeTensor(
          "float32",
          new Float32Array([0.5, 0.4, 0.9, 0.8, 4, 4]),
          [1, 1, 6]
        ),
      });

    vi.doMock("onnxruntime-web", () => ({
      __esModule: true,
      Tensor: FakeTensor,
    }));

    const createOrtSession = vi.fn().mockResolvedValue({
      inputNames: ["images"],
      outputNames: ["output"],
      inputMetadata: { images: { dimensions: [1, 3, 640, 640] } },
      run: runMock,
    });

    vi.doMock("@/ort-setup", () => ({
      __esModule: true,
      createOrtSession,
    }));

    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      statusText: "OK",
      headers: {
        get: (key: string) =>
          key.toLowerCase() === "content-type"
            ? "application/octet-stream"
            : null,
      },
      arrayBuffer: async () => new ArrayBuffer(16 * 1024),
    });

    const { loadFaceModel, detectFaces } = await import(
      "@/runtime/face-detect"
    );

    await loadFaceModel("https://example.com/model.onnx");

    await withFaceConstants(
      {
        TTA_FLIP: true,
        PREFILTER_MIN_SIDE_RATIO: 0,
        PAD_SMALL_SIDE: 0,
        PAD_LARGE_SIDE: 0,
      },
      async () => {
        const img = makeImageData(400, 200);
        const boxes = await detectFaces(img, 0.5);

        expect(runMock).toHaveBeenCalledTimes(2);
        expect(boxes.length).toBe(2);
        const [fused, other] = boxes;
        if (fused && other) {
          expect(fused.x).toBeGreaterThan(30);
          expect(fused.x).toBeLessThan(60);
          expect(other.x).toBeGreaterThan(150);
          expect(other.x).toBeLessThan(270);
        }
      }
    );
  });
});
