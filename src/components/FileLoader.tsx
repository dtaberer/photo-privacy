import { FileLoaderProps } from "@/types/FileLoaderTypes";
import { useEffect } from "react";
import { Form } from "react-bootstrap";
import { FaUpload } from "react-icons/fa";

export function FileLoader({
  onFilePickHandler,
  dragOver,
  setDragOver,
}: FileLoaderProps) {
  //
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const items = Array.from(e.clipboardData?.items ?? []);
      const it = items.find((i) => i.type.startsWith("image/"));
      const file = it?.getAsFile();
      if (file) onFilePickHandler(file);
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [onFilePickHandler]);

  return (
    <Form.Group className="mb-3">
      <label
        className="w-100"
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          const f = e.dataTransfer.files?.[0];
          if (f) onFilePickHandler(f);
        }}
      >
        <div
          className={`d-grid place-items-center text-center p-4 rounded ${
            dragOver
              ? "border border-2 border-primary bg-primary bg-opacity-10"
              : "border border-2 border-secondary-subtle bg-light-subtle"
          }`}
          style={{ cursor: "pointer", minHeight: 140 }}
        >
          <div className="text-secondary">
            <FaUpload className="mb-1 me-1 text-secondary" />
            <div className="fw-semibold">Drag & drop</div>
            <div className="small text-muted">or click to choose a file</div>
          </div>
        </div>
        <Form.Control
          type="file"
          accept="image/*"
          className="visually-hidden"
          onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
            const f = e.currentTarget.files?.[0];
            if (f) onFilePickHandler(f);
            e.currentTarget.value = ""; // allow same file re-pick
          }}
        />
      </label>
    </Form.Group>
  );
}
