// File: src/components/ModelsBadge.tsx
import React, { useCallback, useEffect, useState } from "react";

// Self-contained badge. Only default export (satisfies react-refresh rule).

type FileProbe = { name: string; local: boolean; cdn: boolean };
type ModelHealth = {
  source: "local" | "cdn";
  files: FileProbe[];
  root: string;
  checkedAt: number;
};

const MODEL_RELATIVE_URL = `${import.meta.env.BASE_URL || "/"}models`;
const CDN_FACE_API_MODEL_ROOT =
  "https://cdn.jsdelivr.net/npm/@vladmandic/face-api@1.7.15/model";
const FACE_MODELS = [
  "tiny_face_detector_model-weights_manifest.json",
  "tiny_face_detector_model.bin",
];

async function headOk(url: string): Promise<boolean> {
  try {
    const r = await fetch(url, { method: "HEAD", cache: "no-store" });
    return r.ok;
  } catch {
    return false;
  }
}

async function checkModelAvailability(
  baseUrl: string = MODEL_RELATIVE_URL
): Promise<ModelHealth> {
  const files = await Promise.all(
    FACE_MODELS.map(async (name) => ({
      name,
      local: await headOk(`${baseUrl}/${name}`),
      cdn: await headOk(`${CDN_FACE_API_MODEL_ROOT}/${name}`),
    }))
  );
  const source: "local" | "cdn" = files.every((f) => f.local) ? "local" : "cdn";
  const root = source === "local" ? baseUrl : CDN_FACE_API_MODEL_ROOT;
  return { source, files, root, checkedAt: Date.now() };
}

export default function ModelsBadge({
  className = "",
  showButton = true,
}: {
  className?: string;
  showButton?: boolean;
}) {
  const [info, setInfo] = useState<ModelHealth | null>(null);
  const [checking, setChecking] = useState(false);

  const runCheck = useCallback(async () => {
    setChecking(true);
    try {
      setInfo(await checkModelAvailability());
    } finally {
      setChecking(false);
    }
  }, []);

  useEffect(() => {
    void runCheck();
  }, [runCheck]);

  const label = info
    ? info.source === "local"
      ? "Local"
      : "CDN"
    : "Checking…";
  const title = info
    ? `Root: ${info.root}
Checked: ${new Date(info.checkedAt).toLocaleString()}`
    : "Probing model files…";

  const pillStyle: React.CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    gap: 8,
    border: "1px solid #d0d7de",
    borderRadius: 999,
    padding: "4px 10px",
    fontSize: 12,
    background: "#fff",
    color: "#24292f",
    whiteSpace: "nowrap",
  };

  const dotStyle: React.CSSProperties = {
    width: 8,
    height: 8,
    borderRadius: 999,
    background: info
      ? info.source === "local"
        ? "#2da44e"
        : "#57606a"
      : "#9aa2a9",
  };

  const btnStyle: React.CSSProperties = {
    marginLeft: 8,
    fontSize: 11,
    padding: "2px 8px",
    borderRadius: 6,
    border: "1px solid #d0d7de",
    background: checking ? "#f6f8fa" : "#fff",
    cursor: checking ? "default" : "pointer",
  };

  return (
    <span
      className={className}
      title={title}
      style={{ display: "inline-flex", alignItems: "center" }}
    >
      <span style={pillStyle}>
        <span style={dotStyle} aria-hidden />
        <span>Models: {label}</span>
      </span>
      {showButton && (
        <button
          style={btnStyle}
          onClick={() => void runCheck()}
          disabled={checking}
        >
          {checking ? "Checking…" : "Re-check"}
        </button>
      )}
    </span>
  );
}
