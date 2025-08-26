// src/ort-setup.ts
import * as ort from "onnxruntime-web";
export { ort };

// augment Window so tests can set window.__TEST__
declare global {
  interface Window {
    __TEST__?: boolean;
  }
}

let initialized = false;

export function setupOrt(options?: {
  basePath?: string;
  simd?: boolean;
  threads?: number;
  proxy?: boolean;
}): void {
  if (typeof window !== "undefined" && window.__TEST__) return;
  if (initialized) return;

  const base =
    options?.basePath ??
    (typeof window !== "undefined"
      ? `${window.location.origin}/ort-runtime/`
      : "/ort-runtime/");

  ort.env.wasm.wasmPaths = base;
  ort.env.wasm.simd = options?.simd ?? true;
  ort.env.wasm.numThreads = options?.threads ?? 1;
  ort.env.wasm.proxy = options?.proxy ?? false;

  initialized = true;

  type MaybeViteImportMeta = ImportMeta & { env?: { DEV?: boolean } };
  const isDev =
    typeof import.meta !== "undefined" &&
    (import.meta as MaybeViteImportMeta).env?.DEV === true;

  if (isDev) {
    console.log("[ort-setup] wasmPaths base:", base);
  }
}

export function ortForceBasicWasm(): void {
  ort.env.wasm.simd = false;
  ort.env.wasm.numThreads = 1;
  ort.env.wasm.proxy = false;
}

// ---------- Overloads ----------
export async function createOrtSession(
  model: string,
  sessionOptions?: ort.InferenceSession.SessionOptions
): Promise<ort.InferenceSession>;
export async function createOrtSession(
  model: ArrayBuffer | Uint8Array,
  sessionOptions?: ort.InferenceSession.SessionOptions
): Promise<ort.InferenceSession>;

// ---------- Implementation ----------
export async function createOrtSession(
  model: string | ArrayBuffer | Uint8Array,
  sessionOptions?: ort.InferenceSession.SessionOptions
): Promise<ort.InferenceSession> {
  setupOrt(); // no-op if already initialized / tests

  const opts: ort.InferenceSession.SessionOptions = {
    executionProviders: ["wasm"],
    ...sessionOptions,
  };

  if (typeof model === "string") {
    // ✓ hits the string overload
    return ort.InferenceSession.create(model, opts);
  }

  // here model is ArrayBuffer | Uint8Array — ensure Uint8Array for the bytes overload
  const bytes: Uint8Array =
    model instanceof Uint8Array ? model : new Uint8Array(model);

  // ✓ hits the Uint8Array overload
  return ort.InferenceSession.create(bytes, opts);
}
