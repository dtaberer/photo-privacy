// why: ORT (in dev) imports "/src/ort-wasm-simd-threaded.mjs" directly.
// This shim forwards to the copy we placed in @ort-runtime via ort:prep.
export * from "@ort-runtime/ort-wasm-simd-threaded.mjs";
export { default } from "@ort-runtime/ort-wasm-simd-threaded.mjs";
