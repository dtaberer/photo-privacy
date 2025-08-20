import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import https from "node:https";

const VERSION = process.env.FACE_API_MODEL_VERSION || "1.7.15";
const CDN_ROOT = `https://cdn.jsdelivr.net/npm/@vladmandic/face-api@${VERSION}/model`;
const FILES = [
  "tiny_face_detector_model-weights_manifest.json",
  "tiny_face_detector_model.bin",
];
const DEST_DIR = path.join(process.cwd(), "public", "models");
const FORCE = process.env.FORCE_DOWNLOAD === "1";

async function ensureDir(p) {
  await fsp.mkdir(p, { recursive: true });
}

function download(url, destPath) {
  return new Promise((resolve, reject) => {
    https
      .get(url, (res) => {
        if (
          res.statusCode &&
          res.statusCode >= 300 &&
          res.statusCode < 400 &&
          res.headers.location
        ) {
          return resolve(download(res.headers.location, destPath));
        }
        if (res.statusCode !== 200) {
          return reject(new Error(`HTTP ${res.statusCode} for ${url}`));
        }
        const file = fs.createWriteStream(destPath);
        res.pipe(file);
        file.on("finish", () => file.close(resolve));
        file.on("error", reject);
      })
      .on("error", reject);
  });
}

async function main() {
  await ensureDir(DEST_DIR);
  for (const name of FILES) {
    const dest = path.join(DEST_DIR, name);
    const url = `${CDN_ROOT}/${name}`;
    let needs = FORCE;
    try {
      if (!needs) await fsp.access(dest);
    } catch {
      needs = true;
    }
    if (!needs) {
      console.log(`[models] exists: ${path.relative(process.cwd(), dest)}`);
      continue;
    }
    console.log(`[models] downloading: ${url}`);
    await download(url, dest);
    console.log(`[models] saved: ${path.relative(process.cwd(), dest)}`);
  }
  console.log(`[models] done.`);
}

main().catch((e) => {
  console.error(`[models] failed:`, e);
  process.exitCode = 1;
});
