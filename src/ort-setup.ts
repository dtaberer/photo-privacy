// src/ort-setup.ts — FINAL mapping
import * as ort from "onnxruntime-web/wasm";

/**
 * Single entry for ORT configuration.
 * DEV: /src/ort-runtime/*   (Vite serves ESM correctly)
 * PROD: /ort/*               (copied into public)
 */
const DEV_BASE = new URL("./ort-runtime/", import.meta.url).toString();
const PROD_BASE = "/ort/";
const BASE = import.meta.env.DEV ? DEV_BASE : PROD_BASE;

// Stability-first: main thread, 1 thread. Keep SIMD ON (we ship simd-threaded files).
ort.env.wasm.proxy = false;
ort.env.wasm.numThreads = 1;
(ort.env.wasm as unknown as { simd?: boolean }).simd = true;

// Hard-pin ALL sidecar filenames → BASE so ORT never guesses bare /src/*
(ort.env.wasm as unknown as Record<string, unknown>).wasmPaths = {
  // ESM loaders (both dashed and dotted variants)
  "ort-wasm.min.mjs": BASE,
  "ort-wasm-core.min.mjs": BASE,
  "ort.wasm.min.mjs": BASE,
  "ort.wasm-core.min.mjs": BASE,
  "ort-wasm.jsep.mjs": BASE,
  "ort.wasm.jsep.mjs": BASE,
  "ort-wasm-simd.jsep.mjs": BASE,
  "ort.wasm-simd.jsep.mjs": BASE,
  "ort-wasm-simd-threaded.jsep.mjs": BASE,
  "ort.wasm-simd-threaded.jsep.mjs": BASE,
  "ort-wasm-threaded.jsep.mjs": BASE,
  "ort.wasm-threaded.jsep.mjs": BASE,
  "ort-wasm-simd.mjs": BASE,
  "ort.wasm-simd.mjs": BASE,
  "ort-wasm-simd-threaded.mjs": BASE,
  "ort.wasm-simd-threaded.mjs": BASE,
  "ort-wasm-threaded.mjs": BASE,
  "ort.wasm-threaded.mjs": BASE,
  // WASM binaries (both naming schemes)
  "ort-wasm.wasm": BASE,
  "ort.wasm.wasm": BASE,
  "ort-wasm-threaded.wasm": BASE,
  "ort.wasm-threaded.wasm": BASE,
  "ort-wasm-simd-threaded.wasm": BASE,
  "ort.wasm-simd-threaded.wasm": BASE,
} as Record<string, string>;

if (import.meta.env.DEV) {
  ort.env.debug = true;
  console.log("[ort-setup] wasmPaths base:", BASE);
}

/** Idempotent helper if you call before session.create */
export function ortForceBasicWasm(): void {
  ort.env.wasm.proxy = false;
  ort.env.wasm.numThreads = 1;
  (ort.env.wasm as unknown as { simd?: boolean }).simd = true;
}

/** Create a session from raw bytes (clones buffer to avoid detach issues). */
export async function createOrtSession(
  buf: ArrayBuffer
): Promise<ort.InferenceSession> {
  const opts = { executionProviders: ["wasm"] } as const;
  const cloned = buf.slice(0);
  const view = new Uint8Array(cloned);
  try {
    return await ort.InferenceSession.create(view, opts);
  } catch (e) {
    console.warn(
      "[ort] create(Uint8Array) failed; retrying with ArrayBuffer + 1 thread",
      e
    );
    ort.env.wasm.numThreads = 1;
    return await ort.InferenceSession.create(cloned, opts);
  }
}

export { ort };
