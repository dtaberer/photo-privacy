// session-registry.ts
import * as ort from "onnxruntime-web";

type SessionRecord = { session: ort.InferenceSession; inputName: string };

const cache = new Map<string, Promise<SessionRecord>>();

async function fetchModelBytes(url: string): Promise<Uint8Array> {
  // Optional caching via CacheStorage; safe to keep simple fetch if you prefer
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`Model HTTP ${res.status} @ ${url}`);
  return new Uint8Array(await res.arrayBuffer());
}

export async function ensurePlateSession(modelUrl: string): Promise<SessionRecord> {
  let p = cache.get(modelUrl);
  if (!p) {
    p = (async () => {
      const bytes = await fetchModelBytes(modelUrl);
      const session = await ort.InferenceSession.create(bytes, {
        executionProviders: ["wasm"],
        graphOptimizationLevel: "all",
      });
      return { session, inputName: session.inputNames[0] ?? "images" };
    })();
    cache.set(modelUrl, p);
  }
  return p;
}

export function dropSession(modelUrl?: string) {
  if (modelUrl) cache.delete(modelUrl);
  else cache.clear();
}
