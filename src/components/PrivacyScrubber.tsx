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

const PLATE_BLUR_DFLT = 14;
const PLATE_CONF_DFLT = 0.02;
const FACE_BLUR_DFLT = 12;
const FACE_CONF_DFLT = 0.06;
const IOU_THRESH_DFLT = 0.1;
const PAD_RATIO_DFLT = 0.01;
const MODEL_SIZE_DFLT = 800;
const STATUS_DFLT = "Ready";
const FACE_DETECTION_DFLT = true;
const LICENSE_PLATE_DETECTON_DFLT = true;
const MODEL_URL_DFLT = "/models/license-plate-finetune-v1n.onnx";

export function PrivacyScrubber() {
  const [platesOn, setPlatesOn] = useState<boolean>(
    LICENSE_PLATE_DETECTON_DFLT
  );
  const [facesOn, setFacesOn] = useState<boolean>(FACE_DETECTION_DFLT);
  const [plateBlur, setPlateBlur] = useState<number>(PLATE_BLUR_DFLT);
  const [plateConf, setPlateConf] = useState<number>(PLATE_CONF_DFLT);
  const [faceBlur, setFaceBlur] = useState<number>(FACE_BLUR_DFLT);
  const [faceConf, setFaceConf] = useState<number>(FACE_CONF_DFLT);
  const [iouThresh, setIouThresh] = useState<number>(IOU_THRESH_DFLT);
  const [padRatio, setPadRatio] = useState<number>(PAD_RATIO_DFLT);
  const [status, setStatus] = useState(STATUS_DFLT);
  const [busy, setBusy] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [modelUrl] = useState(MODEL_URL_DFLT);
  const [dragOver, setDragOver] = useState(false);
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
  const [modelSize, setModelSize] = useState(MODEL_SIZE_DFLT);
  const [imgSize, setImgSize] = useState<{ w: number; h: number }>({
    w: 0,
    h: 0,
  });

  const imgRef = useRef<HTMLImageElement>(null!);
  const canvasRef = useRef<HTMLCanvasElement>(null!);
  const faceRef = useRef<BlurHandler>(null!);
  const plateRef = useRef<BlurHandler>(null!);

  const onRedrawHandler = useCallback(
    async (
      ref: React.RefObject<BlurHandler>,
      setter: React.Dispatch<React.SetStateAction<number>>,
      val: number
    ) => {
      setter(val);
      if (!imgRef || !canvasRef || !modelUrl || !canvasRef) {
        console.log("Image/canvas not ready");
        setBusy(false);
        return;
      }

      console.log("onPlateRedrawHandler....");
      ref.current?.redraw();
    },
    [modelUrl]
  );

  // const onPlateRefreshHandler = async () => {
  //   setBusy(true);
  //   const img = imgRef?.current;
  //   const cvs = canvasRef.current;

  //   if (!plateRef || !cvs || !img) {
  //     console.log("Image/canvas not ready");
  //     setBusy(false);
  //     return;
  //   }
  //   console.log("Running detection…");

  //   try {
  //     // Prep canvas
  //     cvs.width = img.naturalWidth;
  //     cvs.height = img.naturalHeight;
  //     const ctx = cvs.getContext("2d");
  //     ctx?.clearRect(0, 0, cvs.width, cvs.height);
  //     ctx?.drawImage(img, 0, 0);
  //     await plateRef.current?.run();
  //     plateRef.current?.redraw();

  //     // await faceRef.current?.run();
  //     // faceRef.current?.redraw();
  //   } catch (e) {
  //     console.log(
  //       `Detection error: ${e instanceof Error ? e.message : String(e)}`
  //     );
  //   } finally {
  //     setCanvasVisible(true);
  //     setBusy(false);
  //     console.log("Done.");
  //   }
  // };

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
      // Prep canvas
      cvs.width = img.naturalWidth;
      cvs.height = img.naturalHeight;
      const ctx = cvs.getContext("2d");
      ctx?.clearRect(0, 0, cvs.width, cvs.height);
      ctx?.drawImage(img, 0, 0);
      await plateRef.current?.run();
      plateRef.current?.redraw();

      await faceRef.current?.run();
      faceRef.current?.redraw();
    } catch (e) {
      console.log(
        `Detection error: ${e instanceof Error ? e.message : String(e)}`
      );
    } finally {
      setCanvasVisible(true);
      setBusy(false);
      console.log("Done.");
    }
  }, []);

  const badgeList = useMemo(
    () => ["SIMD", "1 Thread", "On-Device"] as const,
    []
  );

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
      console.log("Image loaded. Ready to run.");
      setCanvasVisible(false);
      clearCanvas();
    },
    [clearCanvas]
  );

  const onDownloadHandler = useCallback(() => {
    downloadCanvas(canvasRef.current, "redacted.jpg", "image/jpeg", 0.92);
  }, []);

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

  useEffect(() => {
    console.log("PrivacyScrubber line 89");
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
          iouThresh: iouThresh,
          padRatio: padRatio,
          setPerfReport: setPerfPlates,
          modelUrl: modelUrl,
          debugMode: false,
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
          iouThresh: iouThresh,
          padRatio: 0.0, // padRatio,
          setPerfReport: setPerfFaces,
          debugMode: false,
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
                    onClickChangeHandler={(blurVal) =>
                      onRedrawHandler(plateRef, setPlateBlur, blurVal)
                    }
                    setConfVal={setPlateConf}
                    confVal={plateConf}
                    controlName="License Plate Redaction"
                    busy={busy}
                    count={1}
                  />
                )}

                {/* Face Panel */}
                {facesOn && (
                  <ControlPanel
                    blurVal={faceBlur}
                    onClickChangeHandler={(blurVal) =>
                      onRedrawHandler(faceRef, setFaceBlur, blurVal)
                    }
                    setConfVal={setFaceConf}
                    confVal={faceConf}
                    controlName="Facial Redaction"
                    busy={busy}
                    count={1}
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
