#!/usr/bin/env node
// copies onnxruntime-web sidecars into both dev (src/ort-runtime) and prod (public/ort)
// and creates dashed↔dotted filename aliases so any loader naming scheme works.

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

async function copyDirInto(dir, outDev, outProd) {
  const entries = await fs.readdir(dir).catch(() => []);
  const allow = /\.(mjs|wasm|js|map)$/i;
  const files = entries.filter((f) => allow.test(f));
  const srcPaths = files.map((f) => path.join(dir, f));
  await Promise.all(
    srcPaths.flatMap((src) => [
      fs.copyFile(src, path.join(outDev, path.basename(src))).catch(() => {}),
      fs.copyFile(src, path.join(outProd, path.basename(src))).catch(() => {}),
    ])
  );
}

async function addAliasesIn(folder) {
  const entries = await fs.readdir(folder).catch(() => []);
  for (const f of entries) {
    const p = path.join(folder, f);
    // Create dashed <-> dotted aliases so either naming scheme works.
    if (/^ort\.wasm[\w.-]*\.(mjs|wasm)$/i.test(f)) {
      await ensureAlias(p, /^ort\.wasm/, "ort-wasm");
    }
    if (/^ort-wasm[\w.-]*\.(mjs|wasm)$/i.test(f)) {
      await ensureAlias(p, /^ort-wasm/, "ort.wasm");
    }
  }
}

async function copyOrtSidecars() {
  const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
  const outDev = path.join(root, "src", "ort-runtime");
  const outProd = path.join(root, "public", "ort");
  await fs.mkdir(outDev, { recursive: true });
  await fs.mkdir(outProd, { recursive: true });

  // Pull from BOTH export roots to cover version differences.
  const candidates = [];
  try {
    candidates.push(path.dirname(require.resolve("onnxruntime-web/wasm")));
  } catch {}
  try {
    candidates.push(
      path.dirname(
        require.resolve("onnxruntime-web/dist/ort.wasm.bundle.min.mjs")
      )
    );
  } catch {}
  try {
    candidates.push(
      path.dirname(require.resolve("onnxruntime-web/dist/ort-wasm.min.mjs"))
    );
  } catch {}

  if (candidates.length === 0)
    throw new Error("Cannot resolve onnxruntime-web sidecar directories");

  for (const dir of candidates) await copyDirInto(dir, outDev, outProd);

  await addAliasesIn(outDev);
  await addAliasesIn(outProd);

  console.log("[prepare-ort-sidecars] Completed. Sources:");
  for (const d of candidates) console.log("  -", d);
  console.log("Outputs:");
  console.log("  - dev :", outDev);
  console.log("  - prod:", outProd);
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

  // Prefer simd-threaded as the canonical binary if others are missing
  const candidates = [
    "ort-wasm-simd-threaded.wasm",
    "ort.wasm-simd-threaded.wasm",
    "ort-wasm-threaded.wasm",
    "ort.wasm-threaded.wasm",
    "ort-wasm.wasm",
    "ort.wasm.wasm",
  ];

  const pickSource = async () => {
    for (const c of candidates) if (await has(c)) return c;
    return null;
  };

  const src = await pickSource();
  if (!src) return; // nothing to alias from

  // Ensure all common variant names exist (map to src if missing)
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

copyOrtSidecars()
  .then(async () => {
    const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
    const outDev = path.join(root, "src", "ort-runtime");
    const outProd = path.join(root, "public", "ort");
    await ensureVariantFiles(outDev);
    await ensureVariantFiles(outProd);
    console.log(
      "[prepare-ort-sidecars] Ensured variant aliases in",
      outDev,
      "and",
      outProd
    );
  })
  .catch((err) => {
    console.error("[prepare-ort-sidecars] Failed:", err?.stack || err);
    process.exitCode = 1;
  });
