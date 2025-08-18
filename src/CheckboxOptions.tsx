import { Card, Form } from "react-bootstrap";

export function CheckboxOptions() {
  return (
    <Card className="mb-3 shadow-sm border-0" style={{ overflow: "hidden" }}>
      <Card.Header className="bg-light fw-semibold">Options</Card.Header>
      <Card.Body>
        <div className="d-flex flex-wrap gap-4">
          <div className="d-flex flex-column" style={{ minWidth: 220 }}>
            <Form.Check
              type="switch"
              id="opt-faces"
              label="Blur Faces"
              checked={blurFaces}
              disabled={busy}
              onChange={(e) => setBlurFaces(e.target.checked)}
            />
            <small className="text-muted">Hide detected faces.</small>
          </div>

          <div className="d-flex flex-column" style={{ minWidth: 220 }}>
            <Form.Check
              type="switch"
              id="opt-text"
              label="Blur Text (plates, signs)"
              checked={blurText}
              disabled={busy}
              onChange={(e) => setBlurText(e.target.checked)}
            />
            <small className="text-muted">
              Detect signage & plates via OCR.
            </small>
          </div>

          <div className="d-flex flex-column" style={{ minWidth: 220 }}>
            <Form.Check
              type="switch"
              id="opt-pixel"
              label="Pixelate"
              checked={usePixelate}
              disabled={busy}
              onChange={(e) => setUsePixelate(e.target.checked)}
            />
            <small className="text-muted">
              Use pixelation instead of blur.
            </small>
          </div>

          <div className="d-flex flex-column" style={{ minWidth: 220 }}>
            <Form.Check
              type="switch"
              id="opt-ocr-enhance"
              label="High contrast for OCR"
              checked={enhanceOCR}
              disabled={busy || !blurText}
              onChange={(e) => setEnhanceOCR(e.target.checked)}
            />
            <small className="text-muted">
              Grayscale + Otsu threshold improves small text.
            </small>
          </div>

          <div className="d-flex flex-column" style={{ minWidth: 260 }}>
            <Form.Check
              type="switch"
              id="opt-plate"
              label="License plate mode"
              checked={plateMode}
              disabled={busy || !blurText}
              onChange={(e) => setPlateMode(e.target.checked)}
            />
            <small className="text-muted">
              Forces line detection + A–Z/0–9 whitelist.
            </small>
          </div>

          <div className="d-flex flex-column" style={{ minWidth: 260 }}>
            <Form.Check
              type="switch"
              id="opt-superres"
              label="Super‑res OCR (slower)"
              checked={superResOCR}
              disabled={busy || !blurText}
              onChange={(e) => setSuperResOCR(e.target.checked)}
            />
            <small className="text-muted">
              Upscales more aggressively for tiny text.
            </small>
          </div>

          <div className="d-flex flex-column" style={{ minWidth: 260 }}>
            <Form.Check
              type="switch"
              id="opt-gpu"
              label="GPU acceleration (MediaPipe)"
              checked={useGPU}
              disabled={busy}
              onChange={(e) => setUseGPU(e.target.checked)}
            />
            <small className="text-muted">
              CPU is quieter; GPU is faster but may log WebGL.
            </small>
          </div>

          <div className="d-flex flex-column" style={{ minWidth: 260 }}>
            <Form.Check
              type="switch"
              id="opt-debug"
              label="Debug overlay (show boxes)"
              checked={debugOverlay}
              disabled={busy}
              onChange={(e) => setDebugOverlay(e.target.checked)}
            />
            <small className="text-muted">
              Draw labeled boxes for faces (red) & text (blue).
            </small>
          </div>
        </div>
      </Card.Body>
    </Card>
  );
}
