#!/usr/bin/env node
/*
  Build screenshot generator
  - Serves ./docs under the /photo-privacy/ path locally
  - Launches a headless browser (Playwright) and captures docs/screenshot.png
*/
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, '..');
const docsDir = path.join(root, 'docs');
const prefix = '/photo-privacy';

function serveFile(res, p, type = 'text/plain', code = 200) {
  fs.readFile(p)
    .then((buf) => {
      res.writeHead(code, { 'Content-Type': type, 'Cache-Control': 'no-store' });
      res.end(buf);
    })
    .catch(() => {
      res.writeHead(404);
      res.end('Not found');
    });
}

function contentType(p) {
  if (p.endsWith('.html')) return 'text/html; charset=utf-8';
  if (p.endsWith('.js')) return 'text/javascript; charset=utf-8';
  if (p.endsWith('.css')) return 'text/css; charset=utf-8';
  if (p.endsWith('.svg')) return 'image/svg+xml';
  if (p.endsWith('.png')) return 'image/png';
  if (p.endsWith('.jpg') || p.endsWith('.jpeg')) return 'image/jpeg';
  if (p.endsWith('.gif')) return 'image/gif';
  if (p.endsWith('.wasm')) return 'application/wasm';
  if (p.endsWith('.json')) return 'application/json; charset=utf-8';
  return 'application/octet-stream';
}

const server = http.createServer(async (req, res) => {
  const url = req.url || '/';
  // Only handle /photo-privacy/* paths
  if (!url.startsWith(prefix)) {
    res.writeHead(302, { Location: prefix + '/' });
    res.end();
    return;
  }

  let rel = url.slice(prefix.length);
  if (rel === '' || rel === '/') rel = '/index.html';
  const filePath = path.join(docsDir, rel);
  const type = contentType(filePath);
  serveFile(res, filePath, type);
});

async function main() {
  // quick existence check
  try {
    await fs.access(path.join(docsDir, 'index.html'));
  } catch {
    console.error('docs/index.html not found. Run `npm run build` first.');
    process.exit(1);
  }

  // Start server on a random free port
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  const baseUrl = `http://127.0.0.1:${port}${prefix}/`;
  const outPng = path.join(docsDir, 'screenshot.png');

  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
  await page.goto(baseUrl, { waitUntil: 'networkidle' });
  // Give the page a moment to render chips/header nicely
  await page.waitForTimeout(500);
  await page.screenshot({ path: outPng, fullPage: false });
  await browser.close();

  server.close();
  console.log('Saved screenshot →', path.relative(root, outPng));
}

main().catch((err) => {
  console.error(err);
  try { server.close(); } catch {}
  process.exit(1);
});

