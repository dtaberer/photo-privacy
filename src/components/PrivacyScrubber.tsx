import React, {
  useMemo,
  useRef,
  useState,
  useCallback,
  useEffect,
} from "react";
import { Row, Col, Card, Form, Badge } from "react-bootstrap";
import downloadCanvas from "./utils/download-canvas";
import LicensePlateBlur from "./LicensePlateBlur";
import FaceBlur from "./FaceBlur";
import ControlPanel from "./ControlPanel";
import Preview from "./Preview";
import { FileLoader } from "./FileLoader";
import PlateRedactor, { PlateRedactorHandle } from "./PlateRedactor";
import {
  FaceBlurConstants,
  PERFORMANCE_REPORT_ZEROS,
  IMAGE_SIZE,
  LicensePlateBlurConstants,
  USE_MANUAL_REDACTOR,
} from "./constants";
import { Box, Size, BlurHandler } from "@/types/detector-types";

export function PrivacyScrubber() {
  const [platesOn, setPlatesOn] = useState<boolean>(
    LicensePlateBlurConstants.RUN_LICENSE_PLATE_DETECTION
  );
  const [plateFeather, setPlateFeather] = useState<number>(
    LicensePlateBlurConstants.FEATHER_PX
  );
  const [plateBlur, setPlateBlur] = useState<number>(
    LicensePlateBlurConstants.BLUR_DENSITY
  );
  const [plateConf, setPlateConf] = useState<number>(
    LicensePlateBlurConstants.CONFIDENCE_THRESHOLD
  );
  const [faceFeather, setFaceFeather] = useState<number>(
    FaceBlurConstants.FEATHER_PX
  );
  const [facesOn, setFacesOn] = useState<boolean>(
    FaceBlurConstants.RUN_FACE_DETECTION
  );
  const [faceBlur, setFaceBlur] = useState<number>(
    FaceBlurConstants.BLUR_DENSITY
  );
  const [faceConf, setFaceConf] = useState<number>(
    FaceBlurConstants.CONFIDENCE_THRESHOLD
  );
  const [perfPlates, setPerfPlates] = useState<PerformanceReport>(
    PERFORMANCE_REPORT_ZEROS
  );
  const [perfFaces, setPerfFaces] = useState<PerformanceReport>(
    PERFORMANCE_REPORT_ZEROS
  );
  const [modelSize] = useState<number>(LicensePlateBlurConstants.MODEL_SIZE);

  const [imgSize, setImgSize] = useState<Size>(IMAGE_SIZE);
  const [busy, setBusy] = useState<boolean>(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState<boolean>(false);
  const [origName, setOrigName] = useState<string | null>(null);
  const [canvasVisible, setCanvasVisible] = useState<boolean>(false);

  const imgRef = useRef<HTMLImageElement>(null!);
  const canvasRef = useRef<HTMLCanvasElement>(null!);
  const faceRef = useRef<BlurHandler<Box> | null>(null);
  const plateRef = useRef<BlurHandler<Box> | null>(null);
  const plateRedactorRef = useRef<PlateRedactorHandle | null>(null);

  useEffect(() => {
    if (!previewUrl) return;
    const cvs = canvasRef.current;
    const ctx = cvs?.getContext("2d");
    if (!cvs || !ctx) return;

    const cleanupFns: Array<() => void> = [];
    const timeout = window.setTimeout(() => {
      const id = requestAnimationFrame(() => {
        ctx.clearRect(0, 0, cvs.width, cvs.height);
        if (platesOn) plateRef.current?.redraw();
        if (facesOn) faceRef.current?.redraw();
        setCanvasVisible((v) => (v ? v : true));
      });
      cleanupFns.push(() => cancelAnimationFrame(id));
    }, 32);
    cleanupFns.push(() => clearTimeout(timeout));
    return () => {
      for (const fn of cleanupFns) fn();
    };
  }, [
    previewUrl,
    platesOn,
    facesOn,
    plateBlur,
    plateConf,
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
      setBusy(false);
      return;
    }

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
    }
  }, [facesOn]);

  const badgeList = useMemo(
    () => ["SIMD", "1 Thread", "On-Device"] as const,
    []
  );

  const fmtMs = (ms: number) => `${ms.toFixed(1)}ms`;

  const clearCanvas = useCallback(() => {
    const cvs = canvasRef.current;
    const ctx = cvs?.getContext("2d");
    if (cvs && ctx) {
      ctx.clearRect(0, 0, cvs.width, cvs.height);
    }
  }, []);

  const onFilePickHandler = useCallback((file: File): void => {
    const url = URL.createObjectURL(file);
    setOrigName(file.name);
    setPreviewUrl((old) => {
      if (old?.startsWith("blob:")) URL.revokeObjectURL(old);
      return url;
    });
  }, []);

  const onDownloadHandler = useCallback(() => {
    const base = imgRef.current;
    const overlay = canvasRef.current;

    if (!base || !overlay) return;
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
      clearCanvas();
      if (previewUrl?.startsWith("blob:")) {
        URL.revokeObjectURL(previewUrl);
      }
    };
  }, [clearCanvas, previewUrl]);

  return (
    <div className={`bg-light min-vh-100 ${busy ? "cursor-busy" : ""}`}>
      <LicensePlateBlur
        ref={plateRef}
        imgRef={imgRef}
        canvasRef={canvasRef}
        opts={{
          modelSize: modelSize,
          confThresh: plateConf,
          blurStrength: plateBlur,
          setPerfReport: setPerfPlates,
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
          setPerfReport: setPerfFaces,
          featherPx: faceFeather,
        }}
      />
      <Row className="g-3">
        <Preview
          imgSize={imgSize}
          setImgSize={setImgSize}
          onClickRefreshHandler={onRefreshHandler}
          onClickDownloadHandler={onDownloadHandler}
          canvasRef={canvasRef}
          title="Preview"
          previewUrl={previewUrl ?? null}
          badgeList={[...badgeList]}
          imgRef={imgRef}
          canvasVisible={canvasVisible}
          busy={busy}
        />
        {USE_MANUAL_REDACTOR && previewUrl && (
          <PlateRedactor
            ref={plateRedactorRef}
            imageURL={previewUrl!}
            blurVal={plateBlur}
            width={900}
            height={600}
          />
        )}

        <Col md={4}>
          <div className="sticky-top sticky-offset-1">
            <Card className="shadow-sm border-0">
              <Card.Body>
                <FileLoader
                  onFilePickHandler={onFilePickHandler}
                  setDragOver={setDragOver}
                  dragOver={dragOver}
                  busy={busy}
                />

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
                      {`${perfPlates.count} · ${fmtMs(perfPlates.total)}`}
                    </Badge>
                  </div>
                </div>

                <div className="px-2 mb-3">
                  <div className="d-flex align-items-center justify-content-between">
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
                      {`${perfFaces.count} · ${fmtMs(perfFaces.total)}`}
                    </Badge>
                  </div>
                </div>

                {platesOn && (
                  <ControlPanel
                    blurVal={plateBlur}
                    busy={busy}
                    confVal={plateConf}
                    controlName="License Plate Redaction"
                    count={perfPlates.count}
                    setBlurVal={setPlateBlur}
                    setThreshVal={setPlateConf}
                    featherVal={plateFeather}
                    setFeatherVal={setPlateFeather}
                  />
                )}

                {facesOn && (
                  <ControlPanel
                    blurVal={faceBlur}
                    busy={busy}
                    confVal={faceConf}
                    controlName="Facial Redaction"
                    count={perfFaces.count}
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
