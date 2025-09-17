#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.dirname(__dirname);
const coverageSummaryPath = path.join(root, "coverage", "coverage-summary.json");
const badgesDir = path.join(root, "docs", "badges");

const metrics = [
  { key: "statements", label: "statements" },
  { key: "branches", label: "branches" },
  { key: "functions", label: "functions" },
  { key: "lines", label: "lines" },
];

async function readCoverageSummary() {
  try {
    const raw = await fs.readFile(coverageSummaryPath, "utf8");
    return JSON.parse(raw);
  } catch (err) {
    if (err && typeof err === "object" && "code" in err && err.code !== "ENOENT") {
      console.warn("[coverage-badges] Failed to parse coverage summary:", err);
    }
    return null;
  }
}

function formatPct(value) {
  if (value == null || Number.isNaN(value)) return null;
  return Math.round(Number(value));
}

function colorForPct(pct) {
  if (pct == null) return "lightgrey";
  if (pct >= 90) return "brightgreen";
  if (pct >= 75) return "yellow";
  if (pct >= 50) return "orange";
  return "red";
}

async function ensureDir(dir) {
  await fs.mkdir(dir, { recursive: true });
}

async function writeBadge({ file, label, message, color }) {
  const payload = {
    schemaVersion: 1,
    label,
    message,
    color,
  };
  const json = JSON.stringify(payload, null, 2);
  await fs.writeFile(file, json, "utf8");
}

async function main() {
  const summary = await readCoverageSummary();
  await ensureDir(badgesDir);

  for (const metric of metrics) {
    const outFile = path.join(badgesDir, `${metric.key}.json`);
    let pct = null;
    if (summary && summary.total && metric.key in summary.total) {
      pct = formatPct(summary.total[metric.key].pct);
    }
    const message = pct == null ? "pending" : `${pct}%`;
    const color = colorForPct(pct);
    await writeBadge({ file: outFile, label: metric.label, message, color });
  }

  console.log("[coverage-badges] Updated badge JSON in", badgesDir);
  if (!summary) {
    console.log(
      "[coverage-badges] No coverage summary found; badges marked as pending. Run `npm run coverage:generate` first."
    );
  }
}

main().catch((err) => {
  console.error("[coverage-badges] Failed:", err);
  process.exitCode = 1;
});
