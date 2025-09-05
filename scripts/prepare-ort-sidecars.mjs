#!/usr/bin/env node
// Copy onnxruntime-web sidecars into public/ort-runtime and create dashed↔dotted aliases.
import { createRequire } from "node:module";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);

async function ensureAlias(filePath, pattern, replacer) {
  const dir = path.dirname(filePath);
  const base = path.basename(filePath);
  const alias = base.replace(pattern, replacer);
  if (alias === base) return;
  const dst = path.join(dir, alias);
  try {
    await fs.access(dst);
  } catch {
    await fs.copyFile(filePath, dst).catch(() => {});
  }
}

async function copyDirInto(dir, outDir) {
  const entries = await fs.readdir(dir).catch(() => []);
  const allow = /\.(mjs|wasm|js|map)$/i;
  const files = entries.filter((f) => allow.test(f));
  await fs.mkdir(outDir, { recursive: true });
  await Promise.all(
    files.map((f) =>
      fs.copyFile(path.join(dir, f), path.join(outDir, f)).catch(() => {})
    )
  );
}

async function addAliasesIn(folder) {
  const entries = await fs.readdir(folder).catch(() => []);
  for (const f of entries) {
    const p = path.join(folder, f);
    if (/^ort\.wasm[\w.-]*\.(mjs|wasm)$/i.test(f))
      await ensureAlias(p, /^ort\.wasm/, "ort-wasm");
    if (/^ort-wasm[\w.-]*\.(mjs|wasm)$/i.test(f))
      await ensureAlias(p, /^ort-wasm/, "ort.wasm");
  }
}

async function ensureVariantFiles(folder) {
  const has = async (f) =>
    !!(await fs.stat(path.join(folder, f)).catch(() => null));
  const copyAs = async (srcBase, dstBase) => {
    const src = path.join(folder, srcBase);
    const dst = path.join(folder, dstBase);
    try {
      await fs.copyFile(src, dst);
    } catch {}
  };
  const candidates = [
    "ort-wasm-simd-threaded.wasm",
    "ort.wasm-simd-threaded.wasm",
    "ort-wasm-threaded.wasm",
    "ort.wasm-threaded.wasm",
    "ort-wasm.wasm",
    "ort.wasm.wasm",
  ];
  let src = null;
  for (const c of candidates)
    if (await has(c)) {
      src = c;
      break;
    }
  if (!src) return;
  const targets = [
    "ort-wasm.wasm",
    "ort.wasm.wasm",
    "ort-wasm-threaded.wasm",
    "ort.wasm-threaded.wasm",
    "ort-wasm-simd-threaded.wasm",
    "ort.wasm-simd-threaded.wasm",
  ];
  for (const t of targets) if (!(await has(t))) await copyAs(src, t);
}

async function main() {
  const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
  // DEV/PROD can both serve from /ort-runtime via Vite's public/ folder
  const outDir = path.join(root, "public", "ort-runtime");
  await fs.mkdir(outDir, { recursive: true });

  const sources = [];
  try {
    sources.push(path.dirname(require.resolve("onnxruntime-web/wasm")));
  } catch {}
  try {
    sources.push(
      path.dirname(
        require.resolve("onnxruntime-web/dist/ort.wasm.bundle.min.mjs")
      )
    );
  } catch {}
  try {
    sources.push(
      path.dirname(require.resolve("onnxruntime-web/dist/ort-wasm.min.mjs"))
    );
  } catch {}

  if (sources.length === 0)
    throw new Error("Cannot resolve onnxruntime-web sidecar directories");

  for (const dir of sources) await copyDirInto(dir, outDir);
  await addAliasesIn(outDir);
  await ensureVariantFiles(outDir);

  console.log("[prepare-ort-sidecars] Sources:");
  for (const d of sources) console.log("  -", d);
  console.log("Output:");
  console.log("  -", outDir);
}

main().catch((err) => {
  console.error("[prepare-ort-sidecars] Failed:", err?.stack || err);
  process.exitCode = 1;
});
