export type DownloadType = "image/jpeg" | "image/png";

export function downloadCanvas(
  canvas: HTMLCanvasElement | null,
  filename = "redacted.jpg",
  type: DownloadType = "image/jpeg",
  quality = 0.92
): void {
  if (!canvas) return;
  const isJpeg = type === "image/jpeg";
  canvas.toBlob(
    (blob) => {
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      a.click();
      // Revoke on next tick so the browser has time to start the download
      setTimeout(() => URL.revokeObjectURL(url), 0);
    },
    type,
    isJpeg ? quality : undefined
  );
}

// Also export a default for convenience
export default downloadCanvas;
