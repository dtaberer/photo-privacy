import type { StatusLevel } from "../types/status";
// Ensure the image exists at src/assets/bubble-blower.jpg (or adjust path)
import heroBubbles from "../assets/bubble-blower.jpg";
import { useCallback } from "react";

type TitleProps = {
  busy?: boolean;
  imageURL?: string | null;
  action: () => void;
  statusLevel?: StatusLevel;
  cancellable?: boolean;
  status?: string;
  cancelHandler?: () => void;
  onSelectFileClickHandler?: () => void;
  fileInputRef?: React.RefObject<HTMLInputElement | null>;
  canvasRef?: React.RefObject<HTMLCanvasElement | null>;
  onFileChangeHandler?: (e: React.ChangeEvent<HTMLInputElement>) => void;
};

export function Title({
  busy,
  imageURL,
  fileInputRef,
  onFileChangeHandler,
  canvasRef,
}: TitleProps) {
  const download = useCallback(() => {
    const cvs = canvasRef?.current;
    if (!cvs) return;
    const url = cvs.toDataURL("image/jpeg", 0.92);
    const a = document.createElement("a");
    a.href = url;
    a.download = "scrubbed.jpg";
    a.click();
  }, [canvasRef]);

  // Inline background to guarantee precedence over any external CSS
  const heroStyle: React.CSSProperties = {
    // vivid blue photo background; no overlay
    backgroundColor: "#1f62c9",
    backgroundImage: `url(${heroBubbles})`,
    backgroundSize: "cover",
    backgroundPosition: "center",
    backgroundRepeat: "no-repeat",
  } as const;

  return (
    <div className="pps-hero my-3" style={heroStyle}>
      <input
        ref={fileInputRef}
        id="file-input-hidden"
        type="file"
        accept="image/*"
        onChange={onFileChangeHandler}
        hidden
        style={{ display: "none" }}
        tabIndex={-1}
        aria-hidden="true"
      />

      <style>{`
        /* Pastel hero container (structure only; background via inline style) */
        .pps-hero{position:relative;border-radius:24px;padding:40px;margin-bottom:16px;overflow:hidden;color:#fff;}
        /* App-wide font family */
        :root, body, #root { font-family: Tahoma, Verdana, sans-serif; }
        .pps-badges{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px}
        /* Keep action buttons side-by-side */
        .pps-actions{display:flex;gap:12px;align-items:center;flex-wrap:wrap}
        .pps-pill{backdrop-filter:blur(4px);background:rgba(255,255,255,.18);border:1px solid rgba(255,255,255,.38);border-radius:9999px;padding:6px 10px;font-size:12px;color:#fff}
        .pps-heading{font-weight:800;letter-spacing:-.02em;margin:0;line-height:1.05;font-size:clamp(28px,6vw,56px);background:linear-gradient(90deg,#fff 0%,#e6f2ff 40%,#e0ecff 70%,#ffffff 100%);-webkit-background-clip:text;background-clip:text;color:transparent;text-shadow:0 1px 0 rgba(0,0,0,.06)}
        .pps-subtitle{margin-top:8px;margin-bottom:16px;color:rgba(255,255,255,.92);font-size:clamp(14px,2vw,18px)}
        /* Tabs look & feel */
        .pps-tabs .nav-tabs{border-bottom:3px solid #adb9c638 !important;background:var(--bs-body-bg);}
        .pps-tabs .nav-tabs .nav-link{color:#135dac !important;font-weight:700 !important;border-width:3px !important;border-color:transparent !important;}
        .pps-tabs .nav-tabs .nav-link:hover{color:#135dac !important;}
        .pps-tabs .nav-tabs .nav-link.active{color:#135dac !important;font-weight:800 !important;background:var(--bs-body-bg) !important;border-color:#adb9c638 #adb9c638 transparent !important;margin-bottom:-3px !important;}
        .pps-tabs .tab-content{border:3px solid #adb9c638 !important;border-top:0 !important;border-bottom-left-radius:12px;border-bottom-right-radius:12px;padding:1rem;overflow:hidden;box-sizing:border-box;}
        /* Grid tidy to prevent spill */
        .pps-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:1rem;max-width:100%;}
        .pps-grid>*{min-width:0;}
        /* Typography adjustments */
        .text-muted{--bs-text-opacity:1;color:#5e87ac !important;font-weight:400 !important;}
        .small, small{font-size:.760em;color:antiquewhite !important;}`}</style>

      <div className="pps-badges">
        <span className="pps-pill">Local-only</span>
        <span className="pps-pill">No uploads</span>
        <span className="pps-pill">Face + OCR</span>
      </div>
      <h1 className="pps-heading">Photo Privacy Scrubber</h1>
      <p className="pps-subtitle">
        Blur or pixelate faces and text locally. No uploads.
      </p>
      {!busy && (
        <a onClick={download} hidden={busy || !imageURL} className="mt-2">
          Download
        </a>
      )}
    </div>
  );
}
