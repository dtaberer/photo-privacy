// src/components/PrivacyScrubber.tsx
import { useMemo, useRef, useState, useCallback, useEffect, JSX } from "react";
import { Row, Col, Card, Form } from "react-bootstrap";

import { ControlPanel } from "./ControlPanel";
import { ActionControls } from "./ActionControls";
import { Preview } from "./Preview";
import { FileLoader } from "./FileLoader";

// Detect-only APIs (no drawing)
import { detectPlates, MODEL_PLATE_URL } from "./utils/detectPlates";
import { detectFaces, MODEL_FACE_TASK } from "./utils/detectFaces";

// Shared types (declared in src/types/detectors.d.ts or equivalent)
import type {
  BBox,
  DetectTimings,
  ImgSize,
  DetectionResult,
} from "@/types/detectors";

export function PrivacyScrubber(): JSX.Element {
  /* ------------------------------- Refs ------------------------------- */
  const imgRef = useRef<HTMLImageElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // latest detection boxes for fast repaint (no AI)
  const lastBoxesRef = useRef<{ plates: BBox[]; faces: BBox[] }>({
    plates: [],
    faces: [],
  });

  // guard overlapping runs (StrictMode/dev double invoke, fast clicks)
  const runIdRef = useRef(0);

  // rAF throttle for painting on slider drags
  const paintPendingRef = useRef(false);

  // blob revoke and load id tracking
  const revokeAfterLoadRef = useRef<string | null>(null);
  const loadIdRef = useRef<number>(0);

  // debounce handle for re-detect (not used for blur sliders)
  const detectDebounceRef = useRef<number | null>(null);

  /* ------------------------------ UI state ---------------------------- */
  const [status, setStatus] = useState<string>("Drop a photo to begin");
  const [busy, setBusy] = useState<boolean>(false);
  const [canvasVisible, setCanvasVisible] = useState<boolean>(false);

  const [imgSize, setImgSize] = useState<ImgSize>({ w: 0, h: 0 });
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  const [dragOver, setDragOver] = useState<boolean>(false);

  // toggles
  const [platesOn, setPlatesOn] = useState<boolean>(true);
  const [facesOn, setFacesOn] = useState<boolean>(true);

  // sliders: Intensity (px), Sensitivity (0..1)
  const [plateBlur, setPlateBlur] = useState<number>(16);
  const [faceBlur, setFaceBlur] = useState<number>(20);
  const [plateConf, setPlateConf] = useState<number>(0.45); // Sensitivity 0..1
  const [faceConf, setFaceConf] = useState<number>(0.45); // Sensitivity 0..1

  // counts + perf
  const [detections, setDetections] = useState<{
    plates: number;
    faces: number;
  }>({
    plates: 0,
    faces: 0,
  });
  const [perfPlates, setPerfPlates] = useState<DetectTimings | null>(null);
  const [perfFaces, setPerfFaces] = useState<DetectTimings | null>(null);

  /* ----------------------------- Badges ------------------------------- */
  const badgeList = useMemo<ReadonlyArray<string>>(() => {
    const out: string[] = [];
    if (platesOn) out.push(`plates ${detections.plates}`);
    if (facesOn) out.push(`faces ${detections.faces}`);
    return out;
  }, [detections.plates, detections.faces, platesOn, facesOn]);

  /* ---------------------------- Normalizers --------------------------- */
  const emptyRes: DetectionResult = useMemo(
    () => ({ count: 0, boxes: [], timings: undefined }),
    []
  );

  const toDetectionResult = useCallback((r: unknown): DetectionResult => {
    const rr = r as Partial<DetectionResult>;
    const boxes = Array.isArray(rr.boxes) ? rr.boxes : [];
    const count = typeof rr.count === "number" ? rr.count : boxes.length;
    return { count, boxes, timings: rr.timings };
  }, []);

  /* ----------------------------- Painter ------------------------------ */
  const paintWith = useCallback(() => {
    const img = imgRef.current;
    const cvs = canvasRef.current;
    if (!img || !cvs) return;

    const w = img.naturalWidth || img.width;
    const h = img.naturalHeight || img.height;
    const ctx = cvs.getContext("2d");
    if (!ctx) return;

    // base image
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.filter = "none";
    ctx.clearRect(0, 0, w, h);
    ctx.drawImage(img, 0, 0);

    const applyBlur = (boxes: BBox[], radius: number) => {
      const r = Math.max(0, radius | 0);
      if (!boxes.length || r <= 0) return;
      for (const b of boxes) {
        ctx.save();
        ctx.beginPath();
        ctx.rect(b.x, b.y, b.w, b.h);
        ctx.clip();
        ctx.filter = `blur(${r}px)`;
        ctx.drawImage(img, 0, 0);
        ctx.restore();
      }
      ctx.filter = "none";
    };

    // both overlays on the same base frame
    applyBlur(lastBoxesRef.current.plates, plateBlur);
    applyBlur(lastBoxesRef.current.faces, faceBlur);
  }, [plateBlur, faceBlur]);

  const schedulePaint = useCallback(() => {
    if (paintPendingRef.current) return;
    paintPendingRef.current = true;
    requestAnimationFrame(() => {
      paintPendingRef.current = false;
      paintWith();
    });
  }, [paintWith]);

  /* ------------------------- Slider handlers -------------------------- */
  const onPlateBlurChange = useCallback(
    (v: number) => {
      setPlateBlur(v);
      schedulePaint(); // repaint from cached boxes; no AI
    },
    [schedulePaint]
  );

  const onFaceBlurChange = useCallback(
    (v: number) => {
      setFaceBlur(v);
      schedulePaint(); // repaint from cached boxes; no AI
    },
    [schedulePaint]
  );

  const onPlateConfChange = useCallback((v: number) => setPlateConf(v), []);
  const onFaceConfChange = useCallback((v: number) => setFaceConf(v), []);

  /* --------------------------- File handling -------------------------- */
  const onFilePickHandler = useCallback((file: File) => {
    const url = URL.createObjectURL(file);

    // Revoke previous blob after next image finishes loading
    setPreviewUrl((prev) => {
      if (prev?.startsWith("blob:")) revokeAfterLoadRef.current = prev;
      return url;
    });

    // Pre-measure to lock aspect ratio ASAP (minimize layout jump)
    const probe = new Image();
    probe.onload = () => {
      setImgSize({
        w: probe.naturalWidth || 0,
        h: probe.naturalHeight || 0,
      });
      // Make canvas visible once we have dimensions
      setCanvasVisible(true);
    };
    probe.src = url;

    setBusy(true);
    setStatus("Image loaded — running detection…");
    loadIdRef.current += 1;
  }, []);

  const onDownloadHandler = useCallback(() => {
    const cvs = canvasRef.current;
    if (!cvs) return;
    const a = document.createElement("a");
    a.download = "redacted.png";
    a.href = cvs.toDataURL("image/png");
    a.click();
  }, []);

  /* --------------------------- Detection run -------------------------- */
  const onRefreshHandler = useCallback(async () => {
    const img = imgRef.current;
    const cvs = canvasRef.current;
    if (!img || !cvs) return;

    const myRun = ++runIdRef.current;

    // Lock canvas pixels BEFORE painting
    const w = img.naturalWidth || img.width;
    const h = img.naturalHeight || img.height;
    if (cvs.width !== w) cvs.width = w;
    if (cvs.height !== h) cvs.height = h;

    setBusy(true);
    setStatus("Detecting…");

    // Draw base once (avoid flashing old frame)
    const ctx = cvs.getContext("2d");
    if (ctx) {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.filter = "none";
      ctx.clearRect(0, 0, w, h);
      ctx.drawImage(img, 0, 0);
    }

    // Normalize confidence in case a 0–100 UI sneaks in
    const pConf = plateConf > 1 ? plateConf / 100 : plateConf;
    const fConf = faceConf > 1 ? faceConf / 100 : faceConf;

    // Build promises → always normalize to DetectionResult
    const platePromise: Promise<DetectionResult> = platesOn
      ? detectPlates(img, {
          modelUrl: MODEL_PLATE_URL,
          modelSize: 640,
          confThresh: Math.min(Math.max(pConf, 0), 1),
          iouThresh: 0.6,
          // If your ONNX differs, adjust these 3:
          assumeNormalized: true,
          boxFormat: "xywh",
          boxSpace: "normalized",
        }).then(toDetectionResult)
      : Promise.resolve<DetectionResult>(emptyRes);

    const facePromise: Promise<DetectionResult> = facesOn
      ? detectFaces(img, {
          modelAssetPath: MODEL_FACE_TASK,
          minDetectionConfidence: Math.min(Math.max(fConf, 0), 1),
        }).then(toDetectionResult)
      : Promise.resolve<DetectionResult>(emptyRes);

    const [plateRes, faceRes] = await Promise.all([platePromise, facePromise]);

    // Drop if a newer run started
    if (myRun !== runIdRef.current) return;

    // Cache boxes → single paint pass with current slider values
    lastBoxesRef.current = {
      plates: plateRes.boxes ?? [],
      faces: faceRes.boxes ?? [],
    };
    paintWith();

    // Update UI
    setDetections({ plates: plateRes.count, faces: faceRes.count });
    setPerfPlates(plateRes.timings ?? null);
    setPerfFaces(faceRes.timings ?? null);
    setStatus("Done");
    setBusy(false);
    setCanvasVisible(true);
  }, [
    plateConf,
    faceConf,
    platesOn,
    facesOn,
    paintWith,
    emptyRes,
    toDetectionResult,
  ]);

  /* ------------------------------ Effects ----------------------------- */
  // Kick detection when the <img> actually finishes loading (natural size known)
  useEffect(() => {
    const img = imgRef.current;
    if (!img || !previewUrl) return;

    const go = () => {
      const w = img.naturalWidth || img.width || 0;
      const h = img.naturalHeight || img.height || 0;
      if (w && h) setImgSize({ w, h });
      // keep canvas visible; spinner overlays while busy
      setStatus("Running detection…");
      void onRefreshHandler();

      // revoke previous blob now that the new one is fully loaded
      if (revokeAfterLoadRef.current) {
        URL.revokeObjectURL(revokeAfterLoadRef.current);
        revokeAfterLoadRef.current = null;
      }
    };

    if (img.complete && (img.naturalWidth || img.width)) {
      go();
      return;
    }
    img.addEventListener("load", go, { once: true });
    return () => img.removeEventListener("load", go);
  }, [previewUrl, onRefreshHandler]);

  // Re-detect when things that CHANGE detections change (NOT blur)
  useEffect(() => {
    if (!previewUrl) return;
    if (detectDebounceRef.current)
      window.clearTimeout(detectDebounceRef.current);
    detectDebounceRef.current = window.setTimeout(() => {
      void onRefreshHandler();
    }, 100);
    return () => {
      if (detectDebounceRef.current)
        window.clearTimeout(detectDebounceRef.current);
    };
  }, [previewUrl, platesOn, facesOn, plateConf, faceConf, onRefreshHandler]);

  /* -------------------------------- UI -------------------------------- */
  return (
    <div className="bg-light min-vh-100">
      <Row className="g-3">
        {/* Preview */}
        <Preview
          status={status}
          imgSize={imgSize}
          setImgSize={setImgSize}
          onClickRefreshHandler={onRefreshHandler}
          canvasRef={canvasRef}
          detections={detections}
          title="Preview"
          previewUrl={previewUrl}
          badgeList={badgeList}
          perfPlates={perfPlates}
          perfFaces={perfFaces}
          imgRef={imgRef}
          canvasVisible={canvasVisible}
          busy={busy}
        />

        {/* Controls */}
        <Col md={4}>
          <Card className="shadow-sm border-0">
            <Card.Body>
              {/* Drop zone */}
              <FileLoader
                onFilePickHandler={onFilePickHandler}
                setDragOver={setDragOver}
                dragOver={dragOver}
              />

              {/* Actions */}
              <ActionControls
                onClickRefreshHandler={onRefreshHandler}
                onClickDownloadHandler={onDownloadHandler}
              />

              {/* Master Switches */}
              <div className="d-flex align-items-center gap-3 flex-wrap mb-2">
                <Form.Check
                  type="switch"
                  id="sw-plates"
                  label="Blur License Plates"
                  checked={platesOn}
                  onChange={(e) => setPlatesOn(e.currentTarget.checked)}
                />
                <Form.Check
                  type="switch"
                  id="sw-faces"
                  label="Blur Faces"
                  checked={facesOn}
                  onChange={(e) => setFacesOn(e.currentTarget.checked)}
                />
              </div>

              {/* License Plate Panel */}
              {platesOn && (
                <ControlPanel
                  controlName="License Plate Redaction"
                  blurVal={plateBlur}
                  confVal={plateConf} // 0..1
                  onBlurChange={onPlateBlurChange}
                  onConfChange={onPlateConfChange}
                />
              )}

              {/* Face Panel */}
              {facesOn && (
                <ControlPanel
                  controlName="Facial Redaction"
                  blurVal={faceBlur}
                  confVal={faceConf} // 0..1
                  onBlurChange={onFaceBlurChange}
                  onConfChange={onFaceConfChange}
                />
              )}
            </Card.Body>
          </Card>
        </Col>
      </Row>
    </div>
  );
}
