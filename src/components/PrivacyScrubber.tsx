import React, {
  useMemo,
  useRef,
  useState,
  useCallback,
  useEffect,
} from "react";
import { Row, Col, Card, Form, Badge } from "react-bootstrap";
import downloadCanvas from "./utils/download-canvas";
import { LicensePlateBlur } from "./LicensePlateBlur";
import { FaceBlur } from "./FaceBlur";
import ControlPanel from "./ControlPanel";
import Preview from "./Preview";
import { FileLoader } from "./FileLoader";
import PlateRedactor, { type PlateRedactorHandle } from "./PlateRedactor";

const PERFORMANCE_REPORT_DEFAULT = {
  count: 0,
  total: 0,
  timings: {
    preprocess: 0,
    run: 0,
    post: 0,
    total: 0,
  },
};

const FACE_BLUR_DFLT = 40;
const FACE_CONF_DFLT = 0.05;
const FACE_DETECTION_DFLT = true;
const IOU_THRESH_DFLT = 0.1;
const LICENSE_PLATE_DETECTON_DFLT = true;
const MODEL_SIZE_DFLT = 800;
const MODEL_URL_DFLT = "/models/license-plate-finetune-v1n.onnx";
const PAD_RATIO_DFLT = 0.01;
const PLATE_BLUR_DFLT = 40;
const PLATE_CONF_DFLT = 0.02;
const STATUS_DFLT = "Ready";

const USE_MANUAL = false;

export function PrivacyScrubber() {
  const [platesOn, setPlatesOn] = useState<boolean>(
    LICENSE_PLATE_DETECTON_DFLT
  );

  const [plateFeather, setPlateFeather] = useState<number>(1);
  const [faceFeather, setFaceFeather] = useState<number>(1);

  const [facesOn, setFacesOn] = useState<boolean>(FACE_DETECTION_DFLT);
  const [plateBlur, setPlateBlur] = useState<number>(PLATE_BLUR_DFLT);
  const [plateConf, setPlateConf] = useState<number>(PLATE_CONF_DFLT);
  const [faceBlur, setFaceBlur] = useState<number>(FACE_BLUR_DFLT);
  const [faceConf, setFaceConf] = useState<number>(FACE_CONF_DFLT);
  const faceIouThresh = IOU_THRESH_DFLT;
  const plateIouThresh = IOU_THRESH_DFLT;
  const [padRatio] = useState<number>(PAD_RATIO_DFLT);
  const [status, setStatus] = useState(STATUS_DFLT);
  const [busy, setBusy] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [modelUrl] = useState(MODEL_URL_DFLT);
  const [dragOver, setDragOver] = useState(false);
  const [origName, setOrigName] = useState<string | null>(null);
  const [perfPlates, setPerfPlates] = useState<PerformanceReport>(
    PERFORMANCE_REPORT_DEFAULT
  );

  const [perfFaces, setPerfFaces] = useState<PerformanceReport>({
    count: 0,
    total: 0,
    timings: {
      preprocess: 0,
      run: 0,
      post: 0,
      total: 0,
    },
  });

  const [canvasVisible, setCanvasVisible] = useState(false);
  const [modelSize] = useState(MODEL_SIZE_DFLT);
  const [imgSize, setImgSize] = useState<{ w: number; h: number }>({
    w: 0,
    h: 0,
  });

  const imgRef = useRef<HTMLImageElement>(null!);
  const canvasRef = useRef<HTMLCanvasElement>(null!);
  const faceRef = useRef<BlurHandler>(null!);
  const plateRef = useRef<BlurHandler>(null!);
  const plateRedactorRef = useRef<PlateRedactorHandle>(null);

  useEffect(() => {
    // Only when an image is loaded
    if (!previewUrl) return;
    const cvs = canvasRef.current;
    const ctx = cvs?.getContext("2d");
    if (!cvs || !ctx) return;

    // Schedule on next paint to keep sliders snappy
    const id = requestAnimationFrame(() => {
      // Start clean, then redraw plates → faces (faces composes on top)
      ctx.clearRect(0, 0, cvs.width, cvs.height);
      if (platesOn) plateRef.current?.redraw();
      if (facesOn) faceRef.current?.redraw();
      setCanvasVisible(true);
    });
    return () => cancelAnimationFrame(id);
  }, [
    previewUrl,
    platesOn,
    facesOn,
    plateBlur,
    plateConf,
    plateIouThresh,
    plateFeather,
    faceBlur,
    faceConf,
    faceFeather,
  ]);

  const onRefreshHandler = useCallback(async () => {
    setBusy(true);
    const img = imgRef?.current;
    const cvs = canvasRef.current;

    if (!cvs || !img) {
      console.log("Image/canvas not ready");
      setBusy(false);
      return;
    }
    console.log("Running detection…");

    try {
      await plateRef.current?.run();
      void plateRedactorRef.current?.prefillFromDetections(
        plateRef.current?.getDetections?.() ?? []
      );
      if (facesOn) {
        await faceRef.current?.run();
      }
    } catch (e) {
      console.log(
        `Detection error: ${e instanceof Error ? e.message : String(e)}`
      );
    } finally {
      setCanvasVisible(true);
      setBusy(false);
      console.log("Done.");
    }
  }, [facesOn]);

  const badgeList = useMemo(
    () => ["SIMD", "1 Thread", "On-Device"] as const,
    []
  );

  const clearCanvas = useCallback(() => {
    const cvs = canvasRef.current;
    const ctx = cvs?.getContext("2d");
    if (cvs && ctx) {
      ctx.clearRect(0, 0, cvs.width, cvs.height);
    }
  }, []);

  const onFilePickHandler = useCallback(
    (file: File): void => {
      const url = URL.createObjectURL(file);
      setOrigName(file.name);
      setPreviewUrl((old) => {
        if (old?.startsWith("blob:")) URL.revokeObjectURL(old);
        return url;
      });
      console.log("Image loaded. Ready to run.");
      setCanvasVisible(false);
      clearCanvas();
    },
    [clearCanvas]
  );

  const onDownloadHandler = useCallback(() => {
    const base = imgRef.current; // <img> from <Preview>
    const overlay = canvasRef.current; // overlay <canvas> from LicensePlateBlur

    if (!base || !overlay) return;

    // Use the overlay’s internal size (device pixels) so the two layers line up
    const W = overlay.width;
    const H = overlay.height;

    const out = document.createElement("canvas");
    out.width = W;
    out.height = H;
    const ctx = out.getContext("2d");
    if (!ctx) return;

    ctx.drawImage(base, 0, 0, W, H);
    ctx.drawImage(overlay, 0, 0, W, H);

    const name = origName ?? "image.jpg";
    const dot = name.lastIndexOf(".");
    const baseName = dot >= 0 ? name.slice(0, dot) : name;
    const ext = (dot >= 0 ? name.slice(dot + 1) : "jpg").toLowerCase();
    const safeExt =
      ext === "png" ? "png" : ext === "jpeg" || ext === "jpg" ? "jpg" : "jpg";
    const mime = safeExt === "png" ? "image/png" : "image/jpeg";
    const filename = `${baseName}-redacted.${safeExt}`;

    downloadCanvas(out, filename, mime, 0.92);
  }, [origName]);

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

  useEffect(() => {
    return () => {
      if (previewUrl?.startsWith("blob:")) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  return (
    <div
      className="bg-light min-vh-100"
      style={{ cursor: busy ? "progress" : "default" }} // busy cursor
    >
      <LicensePlateBlur
        ref={plateRef}
        imgRef={imgRef}
        canvasRef={canvasRef}
        opts={{
          modelSize: modelSize,
          confThresh: plateConf,
          blurStrength: plateBlur,
          iouThresh: plateIouThresh,
          padRatio: padRatio,
          setPerfReport: setPerfPlates,
          modelUrl: modelUrl,
          debugMode: false,
          featherPx: plateFeather,
        }}
      />
      <FaceBlur
        ref={faceRef}
        imgRef={imgRef}
        canvasRef={canvasRef}
        opts={{
          modelSize: 544,
          confThresh: faceConf,
          blurStrength: faceBlur,
          iouThresh: faceIouThresh,
          padRatio: padRatio,
          setPerfReport: setPerfFaces,
          debugMode: false,
          featherPx: faceFeather,
        }}
      />
      <Row className="g-3">
        {/* Preview column */}
        <Preview
          imgSize={imgSize}
          setImgSize={setImgSize}
          onClickRefreshHandler={onRefreshHandler}
          onClickDownloadHandler={onDownloadHandler}
          canvasRef={canvasRef}
          title="Preview"
          previewUrl={previewUrl ?? null}
          badgeList={[...badgeList]}
          perfPlates={perfPlates}
          perfFaces={perfFaces}
          imgRef={imgRef}
          canvasVisible={canvasVisible}
          busy={busy}
        />
        {USE_MANUAL && (
          <PlateRedactor
            ref={plateRedactorRef}
            imageURL={previewUrl!}
            blurVal={plateBlur}
            width={900}
            height={600}
          />
        )}
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
                    {/* <Badge
                      bg="secondary"
                      className="bg-opacity-10 text-secondary border border-secondary border-opacity-25 px-2 py-1 small"
                    >
                      {detections.plates}
                    </Badge> */}
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
                      "detections.faces"
                    </Badge>
                  </div>
                </div>

                {/* License Plate Panel */}
                {platesOn && (
                  <ControlPanel
                    blurVal={plateBlur}
                    busy={busy}
                    confVal={plateConf}
                    controlName="License Plate Redaction"
                    count={1}
                    setBlurVal={setPlateBlur}
                    setThreshVal={setPlateConf}
                    featherVal={plateFeather}
                    setFeatherVal={setPlateFeather}
                  />
                )}

                {/* Face Panel */}
                {facesOn && (
                  <ControlPanel
                    blurVal={faceBlur}
                    busy={busy}
                    confVal={faceConf}
                    controlName="Facial Redaction"
                    count={1}
                    setBlurVal={setFaceBlur}
                    setThreshVal={setFaceConf}
                    featherVal={faceFeather}
                    setFeatherVal={setFaceFeather}
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
