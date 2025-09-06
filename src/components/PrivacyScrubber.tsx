import React, {
  useMemo,
  useRef,
  useState,
  useCallback,
  useEffect,
} from "react";
import { Row, Col, Card, Form } from "react-bootstrap";
import downloadCanvas from "./utils/download-canvas";
import LicensePlateBlur from "./LicensePlateBlur";
import FaceBlur from "./FaceBlur";
import ControlPanel from "./ControlPanel";
import Preview from "./Preview";
import ActionControls from "./ActionControls";
import demoImage from "../assets/demo1.jpg";
import demoImage2 from "../assets/demo2.jpg";
import fallbackDemo2 from "../assets/demo2.jpg"; // fallback if demo2.jpg is not present
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
  const rightPaneRef = useRef<HTMLDivElement>(null);
  const leftHeaderRef = useRef<HTMLDivElement>(null);
  const [initialPreviewHeight, setInitialPreviewHeight] = useState<number>(0);
  const demoPendingRef = useRef(false);
  const [showDemoOverlay, setShowDemoOverlay] = useState<boolean>(true);
  const [demoMode, setDemoMode] = useState<boolean>(false);
  const [demoStep, setDemoStep] = useState<number>(0); // 0 = intro, 1 = blur/feather tips, 2 = filter tips
  const BASE =
    (import.meta as unknown as { env?: Record<string, string> }).env
      ?.BASE_URL ?? "/";
  const basePath = BASE.endsWith("/") ? BASE : `${BASE}/`;
  const demo2Url = `${basePath}demo2.jpg`;

  const imgRef = useRef<HTMLImageElement>(null!);
  const canvasRef = useRef<HTMLCanvasElement>(null!);
  const faceRef = useRef<BlurHandler<Box> | null>(null);
  const plateRef = useRef<BlurHandler<Box> | null>(null);
  const plateRedactorRef = useRef<PlateRedactorHandle | null>(null);

  useEffect(() => {
    // Preload demo image into the preview on first mount
    setOrigName("demo.jpg");
    setPreviewUrl((old) => old ?? demoImage);
  }, []);

  useEffect(() => {
    // Align preview placeholder height to right pane bottom on first load
    const wrapper = rightPaneRef.current;
    const headerEl = leftHeaderRef.current;
    if (!wrapper) return;

    const calc = () => {
      const rightRect = wrapper?.getBoundingClientRect();
      const headerRect = headerEl?.getBoundingClientRect();
      if (!rightRect || !headerRect) return;
      // Fill from the header's bottom to the right pane's bottom
      const h = Math.max(0, Math.floor(rightRect.bottom - headerRect.bottom));
      setInitialPreviewHeight(h);
    };

    let ro: ResizeObserver | null = null;
    if (typeof ResizeObserver !== "undefined") {
      ro = new ResizeObserver(() => calc());
      ro.observe(wrapper);
    }
    window.addEventListener("resize", calc);
    const id = window.setTimeout(calc, 0);
    return () => {
      window.clearTimeout(id);
      window.removeEventListener("resize", calc);
      try {
        ro?.disconnect();
      } catch {
        // Error handler
        console.log("ResizeObserver disconnect error");
      }
    };
  }, []);

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
    // Clear previous detections and overlays before loading a new image
    faceRef.current?.reset?.();
    plateRef.current?.reset?.();
    setPerfFaces(PERFORMANCE_REPORT_ZEROS);
    setPerfPlates(PERFORMANCE_REPORT_ZEROS);
    setCanvasVisible(false);
    clearCanvas();
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

  const onTryDemo = useCallback(() => {
    setShowDemoOverlay(false);
    setDemoMode(true);
    setDemoStep(0);
    // reset previous run state
    faceRef.current?.reset?.();
    plateRef.current?.reset?.();
    setPerfFaces(PERFORMANCE_REPORT_ZEROS);
    setPerfPlates(PERFORMANCE_REPORT_ZEROS);
    setCanvasVisible(false);
    clearCanvas();
    // If already showing demo image, just run detection; otherwise load then run
    if (previewUrl === demoImage) {
      void onRefreshHandler();
    } else {
      demoPendingRef.current = true;
      setCanvasVisible(false);
      setOrigName("demo.jpg");
      setPreviewUrl(demoImage);
    }
  }, [onRefreshHandler, previewUrl]);

  const onPreviewImageLoaded = useCallback(() => {
    if (demoPendingRef.current) {
      demoPendingRef.current = false;
      void onRefreshHandler();
    }
  }, [onRefreshHandler]);

  // When a detection run finishes, if we're in demo mode and looking at demo images, show next hints
  useEffect(() => {
    if (!demoMode) return;
    if (!busy && canvasVisible && previewUrl === demoImage) {
      setDemoStep(1);
    }
    if (!busy && canvasVisible && previewUrl === demoImage2) {
      setDemoStep(2);
    }
  }, [busy, canvasVisible, previewUrl, demoMode]);

  const onNextDemo = useCallback(() => {
    setDemoStep(0);
    demoPendingRef.current = true;
    setCanvasVisible(false);
    setOrigName("demo2.jpg");
    // reset caches and perf for the new image
    faceRef.current?.reset?.();
    plateRef.current?.reset?.();
    setPerfFaces(PERFORMANCE_REPORT_ZEROS);
    setPerfPlates(PERFORMANCE_REPORT_ZEROS);
    clearCanvas();
    // Preload the image before swapping previewUrl to avoid broken image paints
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => setPreviewUrl(demo2Url);
    img.onerror = () => setPreviewUrl(fallbackDemo2);
    img.src = demo2Url;
  }, [demo2Url]);

  const onDemoDone = useCallback(() => {
    setDemoMode(false);
    setDemoStep(0);
  }, []);

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
          canvasRef={canvasRef}
          title="Preview"
          previewUrl={previewUrl ?? null}
          badgeList={[...badgeList]}
          imgRef={imgRef}
          canvasVisible={canvasVisible}
          busy={busy}
          initialHeight={initialPreviewHeight}
          headerRef={leftHeaderRef}
          onTryDemo={onTryDemo}
          onImageLoaded={onPreviewImageLoaded}
          showDemoOverlay={showDemoOverlay}
          overlay={
            demoMode && demoStep === 1 ? (
              <div
                className="bg-light bg-opacity-75 rounded p-3 shadow-sm"
                style={{ maxWidth: 680 }}
              >
                <div className="mb-2 fw-semibold">Tips</div>
                <div className="text-muted mb-1">
                  Use the <strong>Blur Opacity</strong> slider to change
                  opacity.
                </div>
                <div className="text-muted mb-3">
                  Use the <strong>Feather</strong> slider to blend the edges of
                  the blurred areas.
                </div>
                <button
                  type="button"
                  className="btn btn-primary btn-sm"
                  onClick={onNextDemo}
                >
                  Next…
                </button>
              </div>
            ) : demoMode && demoStep === 2 ? (
              <div
                className="bg-light bg-opacity-75 rounded p-3 shadow-sm"
                style={{ maxWidth: 720 }}
              >
                <div className="mb-2 fw-semibold">Filter sensitivity</div>
                <div className="text-muted mb-3">
                  In more complex images with many targets at different
                  distances, the <strong>Filter</strong> controls adjust
                  sensitivity and reduce noise or misinterpretations. Try the{" "}
                  <strong>Filter</strong> sliders for both{" "}
                  <em>Face Redaction</em> and
                  <em> License Plate Redaction</em> to set the correct
                  threshold.
                </div>
                <button
                  type="button"
                  className="btn btn-success btn-sm"
                  onClick={onDemoDone}
                >
                  Ready to go!
                </button>
              </div>
            ) : undefined
          }
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
          <div ref={rightPaneRef} className="sticky-top sticky-offset-1">
            <Card className="shadow-sm border-0">
              <Card.Body>
                <FileLoader
                  onFilePickHandler={onFilePickHandler}
                  setDragOver={setDragOver}
                  dragOver={dragOver}
                  busy={busy}
                />

                <div className="mb-2 d-flex justify-content-center">
                  <ActionControls
                    onClickRefreshHandler={onRefreshHandler}
                    onClickDownloadHandler={onDownloadHandler}
                    busy={busy || !previewUrl}
                  />
                </div>

                <div className="px-2 mb-3">
                  <div className="d-flex align-items-center justify-content-between stack-between-sm">
                    <Form.Check
                      type="switch"
                      id="sw-plates"
                      label="Blur License Plates"
                      checked={platesOn}
                      onChange={(e) => setPlatesOn(e.currentTarget.checked)}
                      {...(busy && { disabled: true })}
                    />
                    <span
                      className="badge badge-kpi"
                      style={
                        platesOn
                          ? ({
                              backgroundColor: "var(--bs-primary)",
                              color: "#fff",
                            } as React.CSSProperties)
                          : ({
                              backgroundColor: "#dee2e6",
                              color: "#6c757d",
                            } as React.CSSProperties)
                      }
                    >
                      {`${perfPlates.count} · ${fmtMs(perfPlates.total)}`}
                    </span>
                  </div>
                </div>

                <div className="px-2 mb-3">
                  <div className="d-flex align-items-center justify-content-between stack-between-sm">
                    <Form.Check
                      type="switch"
                      id="sw-faces"
                      label="Blur Faces"
                      checked={facesOn}
                      onChange={(e) => setFacesOn(e.currentTarget.checked)}
                      {...(busy && { disabled: true })}
                    />
                    <span
                      className="badge badge-kpi"
                      style={
                        facesOn
                          ? ({
                              backgroundColor: "var(--bs-primary)",
                              color: "#fff",
                            } as React.CSSProperties)
                          : ({
                              backgroundColor: "#dee2e6",
                              color: "#6c757d",
                            } as React.CSSProperties)
                      }
                    >
                      {`${perfFaces.count} · ${fmtMs(perfFaces.total)}`}
                    </span>
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
