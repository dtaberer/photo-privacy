import { beforeEach, describe, expect, it, vi } from "vitest";

const createOrtMock = () => {
  const create = vi.fn(() => Promise.resolve({} as unknown));
  const env = {
    wasm: {
      wasmPaths: "",
      simd: true,
      numThreads: 1,
      proxy: false,
    },
  };
  return { create, env };
};

describe("ort-setup", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    delete (window as { __TEST__?: boolean }).__TEST__;
  });

  it("configures wasm env once with provided options", async () => {
    const { create, env } = createOrtMock();
    vi.doMock("onnxruntime-web", () => ({
      __esModule: true,
      env,
      InferenceSession: { create },
      Tensor: class {
        constructor(
          public type: string,
          public data: Float32Array,
          public dims: number[]
        ) {}
      },
    }));

    const mod = await import("@/ort-setup");
    mod.setupOrt({
      basePath: "/custom/",
      simd: false,
      threads: 4,
      proxy: true,
    });

    expect(mod.ort.env.wasm.wasmPaths).toBe("/custom/");
    expect(mod.ort.env.wasm.simd).toBe(false);
    expect(mod.ort.env.wasm.numThreads).toBe(4);
    expect(mod.ort.env.wasm.proxy).toBe(true);

    // second call should be ignored because setup is memoized
    mod.setupOrt({ basePath: "/ignored/", threads: 8 });
    expect(mod.ort.env.wasm.wasmPaths).toBe("/custom/");
    expect(mod.ort.env.wasm.numThreads).toBe(4);
    expect(create).not.toHaveBeenCalled();
  });

  it("skips setup when window.__TEST__ is true", async () => {
    const { create, env } = createOrtMock();
    vi.doMock("onnxruntime-web", () => ({
      __esModule: true,
      env,
      InferenceSession: { create },
      Tensor: class {
        constructor(
          public type: string,
          public data: Float32Array,
          public dims: number[]
        ) {}
      },
    }));

    (window as { __TEST__?: boolean }).__TEST__ = true;

    const mod = await import("@/ort-setup");
    mod.setupOrt({ basePath: "/should-not-set/" });

    expect(mod.ort.env.wasm.wasmPaths).toBe("");
    expect(mod.ort.env.wasm.simd).toBe(true);
    expect(create).not.toHaveBeenCalled();
  });

  it("creates sessions for string and binary models", async () => {
    const { create, env } = createOrtMock();
    create
      .mockResolvedValueOnce({ kind: "string" })
      .mockResolvedValueOnce({ kind: "bytes" });

    vi.doMock("onnxruntime-web", () => ({
      __esModule: true,
      env,
      InferenceSession: { create },
      Tensor: class {
        constructor(
          public type: string,
          public data: Float32Array,
          public dims: number[]
        ) {}
      },
    }));

    const { createOrtSession } = await import("@/ort-setup");

    const sessionFromString = await createOrtSession("model.onnx", {
      graphOptimizationLevel: "all",
    });
    expect(sessionFromString).toEqual({ kind: "string" });
    expect(create).toHaveBeenNthCalledWith(
      1,
      "model.onnx",
      expect.objectContaining({ executionProviders: ["wasm"] })
    );

    const buffer = new ArrayBuffer(8);
    const sessionFromBytes = await createOrtSession(buffer, {
      executionProviders: ["cpu"],
    });
    expect(sessionFromBytes).toEqual({ kind: "bytes" });
    const secondCall = create.mock.calls[1];
    if (secondCall) {
      const modelArg = (secondCall as unknown[])[0];
      const optsArg = (secondCall as unknown[])[1];
      expect(modelArg).toBeInstanceOf(Uint8Array);
      expect(optsArg).toEqual({ executionProviders: ["cpu"] });
    }
  });
});
