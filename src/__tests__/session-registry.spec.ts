import { beforeEach, describe, expect, it, vi } from "vitest";

const makeFetch = () =>
  vi.fn().mockResolvedValue({
    ok: true,
    arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer,
  });

describe("session-registry", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("caches sessions per model URL", async () => {
    const fetchMock = makeFetch();
    vi.stubGlobal("fetch", fetchMock);
    const createMock = vi.fn().mockResolvedValue({ inputNames: ["images"] });
    vi.doMock("onnxruntime-web", () => ({
      __esModule: true,
      InferenceSession: { create: createMock },
    }));

    const { ensurePlateSession } = await import("@/runtime/session-registry");

    const first = await ensurePlateSession("https://example.com/model.onnx");
    const second = await ensurePlateSession("https://example.com/model.onnx");

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(createMock).toHaveBeenCalledTimes(1);
    expect(second).toBe(first);
    expect(first.inputName).toBe("images");

    vi.unstubAllGlobals();
  });

  it("drops cache entries when requested", async () => {
    const fetchMock = makeFetch();
    vi.stubGlobal("fetch", fetchMock);
    const createMock = vi.fn().mockResolvedValue({ inputNames: ["plates"] });
    vi.doMock("onnxruntime-web", () => ({
      __esModule: true,
      InferenceSession: { create: createMock },
    }));

    const { ensurePlateSession, dropSession } = await import(
      "@/runtime/session-registry"
    );

    await ensurePlateSession("https://example.com/model.onnx");
    dropSession("https://example.com/model.onnx");
    await ensurePlateSession("https://example.com/model.onnx");

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(createMock).toHaveBeenCalledTimes(2);

    dropSession();
    expect(() => dropSession()).not.toThrow();
    vi.unstubAllGlobals();
  });
});
