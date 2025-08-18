export function Title() {
  const statusColors: Record<StatusLevel, string> = {
    info: "rgba(255,255,255,.92)",
    success: "#bbf7d0",
    warning: "#fde68a",
    danger: "#fecaca",
  };

  return (
    <div className="pps-hero my-3">
      <style>{`
          .pps-hero{position:relative;border-radius:24px;padding:40px;margin-bottom:16px;overflow:hidden;color:#fff;background:
            radial-gradient(1200px 500px at 10% -20%, rgba(255,255,255,.25), transparent 60%),
            linear-gradient(135deg,#0ea5e9 0%,#6366f1 40%,#8b5cf6 70%,#ec4899 100%);
          }
          .pps-hero::after{content:"";position:absolute;inset:-50%;background:conic-gradient(from 0deg at 50% 50%, rgba(255,255,255,.12), transparent 25%, rgba(255,255,255,.12), transparent 50%);filter:blur(80px);opacity:.25;animation:pps-spin 30s linear infinite}
          @keyframes pps-spin{to{transform:rotate(1turn)}}
          .pps-badges{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px}
          .pps-pill{backdrop-filter:blur(6px);background:rgba(255,255,255,.14);border:1px solid rgba(255,255,255,.28);border-radius:9999px;padding:6px 10px;font-size:12px;color:#fff}
          .pps-heading{font-weight:800;letter-spacing:-.02em;margin:0;line-height:1.05;font-size:clamp(28px,6vw,56px);background:linear-gradient(90deg,#fff 0%,#dbeafe 40%,#c7d2fe 70%,#fbcfe8 100%);-webkit-background-clip:text;background-clip:text;color:transparent}
          .pps-subtitle{margin-top:8px;margin-bottom:16px;color:rgba(255,255,255,.92);font-size:clamp(14px,2vw,18px)}
          .pps-actions{display:flex;gap:12px;flex-wrap:wrap}
          .pps-shield{position:absolute;right:-40px;bottom:-40px;width:260px;height:auto;opacity:.18;filter:drop-shadow(0 4px 40px rgba(0,0,0,.45))}
        `}</style>

      <div className="pps-badges">
        <span className="pps-pill">Local-only</span>
        <span className="pps-pill">No uploads</span>
        <span className="pps-pill">Face + OCR</span>
      </div>
      <h1 className="pps-heading">Photo Privacy Scrubber</h1>
      <p className="pps-subtitle">
        Blur or pixelate faces and text locally. No uploads.
      </p>
      <div className="pps-actions">
        <div className="d-flex flex-column align-items-start">
          <Button
            variant="light"
            aria-label="Select image file"
            aria-controls="file-input-hidden"
            onClick={triggerFilePick}
            disabled={busy}
          >
            Select image
          </Button>
        </div>
        <div className="d-flex align-items-center gap-2 flex-wrap">
          <Button
            variant="outline-light"
            onClick={process}
            disabled={!imageURL || busy}
          >
            {busy && (
              <Spinner
                animation="border"
                role="status"
                size="sm"
                className="me-2"
                aria-hidden="true"
              />
            )}
            AI Scrub Image...
          </Button>
          {status && (
            <div
              className="ms-2"
              style={{
                color: statusColors[statusLevel],
                fontSize: 13,
                lineHeight: 1.2,
                whiteSpace: "nowrap",
                opacity:
                  statusLevel === "warning" || statusLevel === "danger"
                    ? 1
                    : 0.6,
                fontWeight:
                  statusLevel === "warning" || statusLevel === "danger"
                    ? 600
                    : 400,
              }}
              aria-live="polite"
            >
              {status}
            </div>
          )}
        </div>
      </div>

      {/* Decorative shield image (decorative only) */}
      <img
        className="pps-shield"
        alt=""
        aria-hidden="true"
        src={
          "data:image/svg+xml;utf8," +
          encodeURIComponent(`<?xml version='1.0' encoding='UTF-8'?>
          <svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'>
            <path fill='#ffffff' fill-opacity='0.85' d='M12 2l7 3v6c0 5-3.5 9.7-7 11-3.5-1.3-7-6-7-11V5l7-3z'/>
            <path fill='#0ea5e9' fill-opacity='0.8' d='M12 4.2l5 2.2v4.5c0 4-2.8 7.7-5 8.9-2.2-1.2-5-4.9-5-8.9V6.4l5-2.2z'/>
            <path fill='#ffffff' fill-opacity='0.95' d='M11 11.5c0-.83.67-1.5 1.5-1.5S14 10.67 14 11.5V13h1.25c.41 0 .75.34.75.75v1.5c0 .41-.34.75-.75.75H9.75A.75.75 0 019 15.25v-1.5c0-.41.34-.75.75-.75H11v-1.5z'/>
          </svg>`)
        }
      />
    </div>
  );
}
