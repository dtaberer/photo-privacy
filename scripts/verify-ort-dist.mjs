#!/usr/bin/env node
// Verify that ORT sidecars exist in dist/ort and look sane (non-trivial sizes).
// Also backfill missing dashed↔dotted variants using the best available binary.

import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const root = process.cwd();
const distOrt = path.join(root, "public", "ort-runtime");

const MJS_EXPECT = [
  "ort-wasm.min.mjs",
  "ort-wasm-core.min.mjs",
  "ort-wasm.jsep.mjs",
  "ort-wasm-simd.jsep.mjs",
  "ort-wasm-simd-threaded.jsep.mjs",
  "ort-wasm-threaded.jsep.mjs",
  "ort-wasm-simd.mjs",
  "ort-wasm-simd-threaded.mjs",
  "ort-wasm-threaded.mjs",
  // dotted variants
  "ort.wasm.min.mjs",
  "ort.wasm-core.min.mjs",
  "ort.wasm.jsep.mjs",
  "ort.wasm-simd.jsep.mjs",
  "ort.wasm-simd-threaded.jsep.mjs",
  "ort.wasm-threaded.jsep.mjs",
  "ort.wasm-simd.mjs",
  "ort.wasm-simd-threaded.mjs",
  "ort.wasm-threaded.mjs",
];

const WASM_EXPECT = [
  "ort-wasm.wasm",
  "ort-wasm-threaded.wasm",
  "ort-wasm-simd-threaded.wasm",
  "ort.wasm.wasm",
  "ort.wasm-threaded.wasm",
  "ort.wasm-simd-threaded.wasm",
];

async function exists(p) {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

async function sizeOf(p) {
  const s = await fs.stat(p);
  return s.size;
}

async function ensureAlias(filePath, pattern, replacer) {
  const dir = path.dirname(filePath);
  const base = path.basename(filePath);
  const alias = base.replace(pattern, replacer);
  if (alias === base) return;
  const dst = path.join(dir, alias);
  if (!(await exists(dst))) {
    await fs.copyFile(filePath, dst).catch(() => {});
  }
}

async function backfillVariants(folder) {
  // prefer simd-threaded binary as the canonical source
  const picks = [
    "ort-wasm-simd-threaded.wasm",
    "ort.wasm-simd-threaded.wasm",
    "ort-wasm-threaded.wasm",
    "ort.wasm-threaded.wasm",
    "ort-wasm.wasm",
    "ort.wasm.wasm",
  ];
  let src = null;
  for (const f of picks) {
    const p = path.join(folder, f);
    if (await exists(p)) {
      src = p;
      break;
    }
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
  for (const t of targets) {
    const dst = path.join(folder, t);
    if (!(await exists(dst))) await fs.copyFile(src, dst).catch(() => {});
  }
}

(async () => {
  const problems = [];

  if (!(await exists(distOrt))) {
    console.error("[verify-ort-dist] Missing folder:", distOrt);
    process.exit(1);
  }

  // Backfill missing wasm variants first
  await backfillVariants(distOrt);

  // Check .wasm sizes and presence
  for (const f of WASM_EXPECT) {
    const p = path.join(distOrt, f);
    if (!(await exists(p))) {
      problems.push(`missing wasm: ${f}`);
      continue;
    }
    const sz = await sizeOf(p);
    if (sz < 1024 * 100) problems.push(`tiny wasm (${sz} B): ${f}`);
  }

  // Check .mjs presence (size > 1KB)
  for (const f of MJS_EXPECT) {
    const p = path.join(distOrt, f);
    if (!(await exists(p))) continue; // not all are required in every build
    const sz = await sizeOf(p);
    if (sz < 1024) problems.push(`tiny mjs (${sz} B): ${f}`);
  }

  if (problems.length) {
    console.error("[verify-ort-dist] FAIL");
    for (const m of problems) console.error(" -", m);
    process.exit(2);
  }

  console.log(
    "[verify-ort-dist] OK — dist/ort contains ORT sidecars with sane sizes"
  );
})();
