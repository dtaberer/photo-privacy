// src/ort-setup.ts
import * as ort from "onnxruntime-web";
export { ort };

// Augment Window so TS knows about __TEST__
declare global {
  interface Window {
    __TEST__?: boolean;
  }
}

let initialized = false;

/**
 * Initialize ONNX Runtime Web to load its .mjs/.wasm from /public/ort-runtime.
 * Call this once before creating any sessions. Safe to call multiple times.
 */
export function setupOrt(options?: {
  basePath?: string;
  simd?: boolean;
  threads?: number;
  proxy?: boolean;
}): void {
  // Skip real ORT setup in unit tests
  if (typeof window !== "undefined" && window.__TEST__) return;
  if (initialized) return;

  const base =
    options?.basePath ??
    (typeof window !== "undefined"
      ? `${window.location.origin}/ort-runtime/`
      : "/ort-runtime/");

  // Dev-stable defaults (no COOP/COEP needed)
  ort.env.wasm.wasmPaths = base;
  ort.env.wasm.simd = options?.simd ?? true; // will fallback if unsupported
  ort.env.wasm.numThreads = options?.threads ?? 1;
  ort.env.wasm.proxy = options?.proxy ?? false;

  initialized = true;

  if (import.meta.env?.DEV) {
    console.log("[ort-setup] wasmPaths base:", base);
  }
}

/** Force most-basic WASM settings (runtime fallback before session create). */
export function ortForceBasicWasm(): void {
  ort.env.wasm.simd = false;
  ort.env.wasm.numThreads = 1;
  ort.env.wasm.proxy = false;
}

/** Ensure ORT is initialized, then create a session. */
export async function createOrtSession(
  modelUrl: string,
  sessionOptions?: ort.InferenceSession.SessionOptions
): Promise<ort.InferenceSession> {
  setupOrt(); // no-op if already initialized or under tests
  const opts: ort.InferenceSession.SessionOptions = {
    executionProviders: ["wasm"],
    ...sessionOptions,
  };
  return ort.InferenceSession.create(modelUrl, opts);
}
