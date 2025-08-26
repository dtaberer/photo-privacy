// src/components/PrivacyScrubber.tsx
import { useMemo, useRef, useState, useCallback, useEffect } from "react";
import { Row, Col, Card, Form } from "react-bootstrap";
import downloadCanvas from "./utils/downloadCanvas";

import {
  runLicensePlateBlurOnCanvas,
  runFaceBlurOnCanvas,
  type DetectTimings,
} from "./utils/detectors";
import ControlPanel from "./ControlPanel";
import ActionControls from "./ActionControls";
import Preview from "./Preview";
import { FileLoader } from "./FileLoader";

/* ============================== Component ============================== */
export function PrivacyScrubber() {
  const [platesOn, setPlatesOn] = useState(true);
  const [facesOn, setFacesOn] = useState(true);
  const [plateBlur, setPlateBlur] = useState(14);
  const [plateConf, setPlateConf] = useState(0.35);
  const [faceBlur, setFaceBlur] = useState(12);
  const [faceConf, setFaceConf] = useState(0.6);
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [status, setStatus] = useState("Model ready. Pick an image.");
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [ready] = useState(true);
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
    const img = imgRef.current;
    const cvs = canvasRef.current;
    if (!img || !cvs) {
      setStatus("Image/canvas not ready");
      return;
    }
    setStatus("Running detection…");
    try {
      // Prepare canvas to match image and draw source
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
      setCanvasVisible(true); // reveal processed overlay
    } catch (e) {
      setStatus(
        `Detection error: ${e instanceof Error ? e.message : String(e)}`
      );
    }
  }, [facesOn, faceBlur, faceConf, platesOn, plateBlur, plateConf, modelUrl]);

  const clearCanvas = useCallback(() => {
    const cvs = canvasRef.current;
    const ctx = cvs?.getContext("2d");
    if (cvs && ctx) {
      ctx.clearRect(0, 0, cvs.width, cvs.height);
      // Reset bitmap to guarantee a transparent overlay
      cvs.width = 0; // also resets drawing state
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
      setCanvasVisible(false); // hide old overlay
      clearCanvas();
    },
    [clearCanvas]
  );

  const refreshRef = useRef(onRefreshHandler);
  useEffect(() => {
    refreshRef.current = onRefreshHandler;
  }, [onRefreshHandler]);

  // Run detection only when imgSize changes (e.g., new image/load completes)
  useEffect(() => {
    if (!imgRef.current) return;
    void refreshRef.current();
  }, [imgSize]);

  const onDownloadHandler = useCallback(() => {
    downloadCanvas(canvasRef.current, "redacted.jpg", "image/jpeg", 0.92);
  }, []);

  useEffect(() => {
    if (previewUrl?.startsWith("blob:")) URL.revokeObjectURL(previewUrl);
  }, [previewUrl]);

  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const items = Array.from(e.clipboardData?.items ?? []);
      const it = items.find((i) => i.type.startsWith("image/"));
      const file = it?.getAsFile();
      console.log("useEffect: 134: file", file);
      if (file) onFilePickHandler(file);
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [onFilePickHandler]);

  return (
    <div className="bg-light min-vh-100">
      <Row className="g-3">
        {/* Preview */}
        <Preview
          imgSize={imgSize}
          setImgSize={setImgSize}
          onClickRefreshHandler={() => {
            void onRefreshHandler();
          }}
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
        />

        {/* Controls */}
        {imgRef && (
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

                <div className="d-flex justify-content-end mb-3">
                  <ActionControls
                    onClickRefreshHandler={onRefreshHandler}
                    onClickDownloadHandler={onDownloadHandler}
                  />
                </div>

                {/* Master Switches */}
                <div className="d-flex align-items-center gap-5 flex-wrap-3 p-3">
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
                  <>
                    <ControlPanel
                      blurVal={plateBlur}
                      setBlurVal={setPlateBlur}
                      confVal={plateConf}
                      setConfVal={setPlateConf}
                      controlName="License Plate Redaction"
                    />
                  </>
                )}

                {/* Face Panel */}
                {facesOn && (
                  <ControlPanel
                    blurVal={faceBlur}
                    setBlurVal={setFaceBlur}
                    confVal={faceConf}
                    setConfVal={setFaceConf}
                    controlName="Facial Redaction"
                  />
                )}
              </Card.Body>
            </Card>
          </Col>
        )}
      </Row>
    </div>
  );
}

export default PrivacyScrubber;
