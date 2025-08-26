// src/components/PrivacyScrubber.tsx
import { useMemo, useRef, useState, useCallback, useEffect } from "react";
import { Row, Col, Card, Form, Badge } from "react-bootstrap";
import downloadCanvas from "./utils/downloadCanvas";

import {
  runLicensePlateBlurOnCanvas,
  runFaceBlurOnCanvas,
  type DetectTimings,
} from "./utils/detectors";
import ControlPanel from "./ControlPanel";
import Preview from "./Preview";
import { FileLoader } from "./FileLoader";

export function PrivacyScrubber() {
  const [platesOn, setPlatesOn] = useState(true);
  const [facesOn, setFacesOn] = useState(true);
  const [plateBlur, setPlateBlur] = useState(14);
  const [plateConf, setPlateConf] = useState(0.35);
  const [faceBlur, setFaceBlur] = useState(12);
  const [faceConf, setFaceConf] = useState(0.6);
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [status, setStatus] = useState("Ready");
  const [busy, setBusy] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [detections, setDetections] = useState({ plates: 0, faces: 0 });
  const [modelUrl] = useState("/models/license-plate-finetune-v1n.onnx");
  const [dragOver, setDragOver] = useState(false);
  const [perfPlates, setPerfPlates] = useState<DetectTimings | null>(null);
  const [perfFaces, setPerfFaces] = useState<DetectTimings | null>(null);
  const [canvasVisible, setCanvasVisible] = useState(false);
  const [imgSize, setImgSize] = useState<{ w: number; h: number }>({
    w: 0,
    h: 0,
  });

  const imgRef = useRef<HTMLImageElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const badgeList = useMemo(
    () => ["SIMD", "1 Thread", "On-Device"] as const,
    []
  );

  const onRefreshHandler = useCallback(async () => {
    setBusy(true);
    const img = imgRef.current;
    const cvs = canvasRef.current;
    if (!img || !cvs) {
      setStatus("Image/canvas not ready");
      setBusy(false);
      return;
    }
    setStatus("Running detection…");

    try {
      // Prep canvas
      cvs.width = img.naturalWidth;
      cvs.height = img.naturalHeight;
      const ctx = cvs.getContext("2d");
      ctx?.clearRect(0, 0, cvs.width, cvs.height);
      ctx?.drawImage(img, 0, 0);

      const plateRes = platesOn
        ? await runLicensePlateBlurOnCanvas(img, cvs, {
            modelUrl,
            blurRadius: plateBlur,
            confThresh: plateConf,
            modelSize: 640,
            iou: 0.45,
            padRatio: 0.2,
          })
        : { count: 0, timings: { preprocess: 0, run: 0, post: 0, total: 0 } };

      const faceRes = facesOn
        ? await runFaceBlurOnCanvas(img, cvs, {
            blurRadius: faceBlur,
            confThresh: faceConf,
          })
        : { count: 0, timings: { preprocess: 0, run: 0, post: 0, total: 0 } };

      setDetections({ plates: plateRes.count, faces: faceRes.count });
      setPerfPlates(plateRes.timings);
      setPerfFaces(faceRes.timings);
      setStatus(`Done — plates ${plateRes.count}, faces ${faceRes.count}`);
      setCanvasVisible(true);
    } catch (e) {
      setStatus(
        `Detection error: ${e instanceof Error ? e.message : String(e)}`
      );
    } finally {
      setBusy(false);
    }
  }, [platesOn, modelUrl, plateBlur, plateConf, facesOn, faceBlur, faceConf]);

  const clearCanvas = useCallback(() => {
    const cvs = canvasRef.current;
    const ctx = cvs?.getContext("2d");
    if (cvs && ctx) {
      ctx.clearRect(0, 0, cvs.width, cvs.height);
      cvs.width = 0;
      cvs.height = 0;
    }
  }, []);

  const onFilePickHandler = useCallback(
    (file: File): void => {
      const url = URL.createObjectURL(file);
      setPreviewUrl((old) => {
        if (old?.startsWith("blob:")) URL.revokeObjectURL(old);
        return url;
      });
      setStatus("Image loaded. Ready to run.");
      setCanvasVisible(false);
      clearCanvas();
    },
    [clearCanvas]
  );

  // keep latest refresh fn
  const refreshRef = useRef(onRefreshHandler);
  useEffect(() => {
    refreshRef.current = onRefreshHandler;
  }, [onRefreshHandler]);

  // When image size is known (load complete), run detection
  useEffect(() => {
    if (!imgRef.current) return;
    void refreshRef.current();
  }, [imgSize]);

  const onDownloadHandler = useCallback(() => {
    downloadCanvas(canvasRef.current, "redacted.jpg", "image/jpeg", 0.92);
  }, []);

  // revoke blob url on change
  useEffect(() => {
    return () => {
      if (previewUrl?.startsWith("blob:")) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  // paste-to-upload
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
    <div
      className="bg-light min-vh-100"
      style={{ cursor: busy ? "progress" : "default" }} // busy cursor
    >
      <Row className="g-3">
        {/* Preview column */}
        <Preview
          imgSize={imgSize}
          setImgSize={setImgSize}
          onClickRefreshHandler={() => void onRefreshHandler()}
          onClickDownloadHandler={onDownloadHandler}
          canvasRef={canvasRef}
          detections={detections}
          title="Preview"
          previewUrl={previewUrl ?? null}
          badgeList={[...badgeList]}
          perfPlates={perfPlates}
          perfFaces={perfFaces}
          imgRef={imgRef}
          canvasVisible={canvasVisible}
          busy={busy}
        />

        {/* Controls column (sticky) */}
        <Col md={4}>
          <div className="sticky-top" style={{ top: "1rem" }}>
            <Card className="shadow-sm border-0">
              <Card.Body>
                {/* Drop zone */}
                <FileLoader
                  onFilePickHandler={onFilePickHandler}
                  setDragOver={setDragOver}
                  dragOver={dragOver}
                  busy={busy}
                />

                {/* Master Switches with count badges */}
                <div className="px-2 mb-3">
                  <div className="d-flex align-items-center justify-content-between">
                    <Form.Check
                      type="switch"
                      id="sw-plates"
                      label="Blur License Plates"
                      checked={platesOn}
                      onChange={(e) => setPlatesOn(e.currentTarget.checked)}
                      {...(busy && { disabled: true })}
                    />
                    <Badge
                      bg="secondary"
                      className="bg-opacity-10 text-secondary border border-secondary border-opacity-25 px-2 py-1 small"
                    >
                      {detections.plates}
                    </Badge>
                  </div>

                  <div className="d-flex align-items-center justify-content-between mt-1">
                    <Form.Check
                      type="switch"
                      id="sw-faces"
                      label="Blur Faces"
                      checked={facesOn}
                      onChange={(e) => setFacesOn(e.currentTarget.checked)}
                      {...(busy && { disabled: true })}
                    />
                    <Badge
                      bg="secondary"
                      className="bg-opacity-10 text-secondary border border-secondary border-opacity-25 px-2 py-1 small"
                    >
                      {detections.faces}
                    </Badge>
                  </div>
                </div>

                {/* License Plate Panel */}
                {platesOn && (
                  <ControlPanel
                    blurVal={plateBlur}
                    setBlurVal={setPlateBlur}
                    confVal={plateConf}
                    setConfVal={setPlateConf}
                    controlName="License Plate Redaction"
                    busy={busy}
                    count={detections.plates}
                    onCommit={() => void onRefreshHandler()} // ← apply on release
                  />
                )}

                {/* Face Panel */}
                {facesOn && (
                  <ControlPanel
                    blurVal={faceBlur}
                    setBlurVal={setFaceBlur}
                    confVal={faceConf}
                    setConfVal={setFaceConf}
                    controlName="Facial Redaction"
                    busy={busy}
                    count={detections.faces}
                    onCommit={() => void onRefreshHandler()} // ← apply on release
                  />
                )}
              </Card.Body>
            </Card>
          </div>
        </Col>
      </Row>
    </div>
  );
}

export default PrivacyScrubber;
