import React from "react";
import { Col, Card, Badge, Spinner } from "react-bootstrap";
import { FaImage } from "react-icons/fa";
import ActionControls from "./ActionControls";

interface PreviewProps {
  onClickRefreshHandler: () => void;
  onClickDownloadHandler: () => void;
  imgSize: { w: number; h: number };
  setImgSize: React.Dispatch<React.SetStateAction<{ w: number; h: number }>>;
  canvasVisible: boolean;
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  title: string;
  previewUrl: string | null;
  badgeList: string[];
  perfPlates: PerformanceReport;
  perfFaces: PerformanceReport;
  imgRef?: React.RefObject<HTMLImageElement | null>;
  busy?: boolean;
}

const Preview: React.FC<PreviewProps> = ({
  onClickRefreshHandler,
  onClickDownloadHandler,
  imgSize,
  setImgSize,
  canvasVisible,
  canvasRef,
  title,
  previewUrl,
  badgeList,
  perfPlates,
  perfFaces,
  imgRef,
  busy,
}) => {
  if (!imgRef) return <div>No image to preview.</div>;

  // Match Bootstrap .btn-sm dimensions:
  // padding: .25rem .5rem; font-size: .875rem; line-height: 1.5
  const chipStyle: React.CSSProperties = {
    padding: "0.25rem 0.5rem",
    fontSize: ".875rem",
    lineHeight: 1.5,
  };
  const chipClass =
    "d-inline-flex align-items-center bg-opacity-10 text-secondary " +
    "border border-secondary border-opacity-25 rounded-2";

  return (
    <Col md={8}>
      <Card
        className="shadow-sm border-0"
        style={{ cursor: busy ? "progress" : "default" }}
      >
        {/* Toolbar header */}
        <Card.Header className="bg-light d-flex align-items-center justify-content-between">
          <div className="d-flex align-items-center gap-2 text-secondary">
            <FaImage className="text-secondary" />
            <span className="fw-semibold">{title}</span>
          </div>

          <div className="d-flex align-items-center gap-2">
            {/* Chips sized exactly like btn-sm */}
            <div className="d-flex align-items-center gap-1">
              {badgeList.map((b) => (
                <Badge
                  key={b}
                  bg="secondary"
                  className={chipClass}
                  style={chipStyle}
                >
                  {b}
                </Badge>
              ))}
            </div>

            <ActionControls
              onClickRefreshHandler={onClickRefreshHandler}
              onClickDownloadHandler={onClickDownloadHandler}
              busy={busy}
            />
          </div>
        </Card.Header>

        {/* Image + overlay canvas */}
        <div
          className="bg-body-tertiary position-relative"
          style={
            imgSize.w && imgSize.h
              ? { aspectRatio: `${imgSize.w} / ${imgSize.h}` }
              : undefined
          }
        >
          <img
            ref={imgRef}
            src={
              previewUrl ??
              "data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs="
            }
            className="w-100 h-100 object-fit-cover"
            crossOrigin="anonymous"
            onLoad={(e) => {
              const w = e.currentTarget.naturalWidth;
              const h = e.currentTarget.naturalHeight;
              setImgSize({ w, h });

              // Lock the overlay canvas to the image's intrinsic pixel size
              const c = canvasRef.current as HTMLCanvasElement | null;
              if (c) {
                c.width = w;
                c.height = h;
              }
            }}
          />
          {busy && (
            <div className="position-absolute top-50 start-50 translate-middle">
              <Spinner animation="border" role="status" aria-label="processing" />
            </div>
          )}
          <canvas
            ref={canvasRef}
            className="position-absolute top-0 start-0 w-100 h-100"
            style={{ visibility: canvasVisible ? "visible" : "hidden" }}
          />
        </div>

        {/* Footer with counts + perf */}
        <Card.Footer className="d-flex flex-column gap-1 small text-secondary">
          <div className="d-flex justify-content-between">
            <span>
              <p>
                "Detections: plates detections.plates · faces detections.faces"
              </p>
            </span>
          </div>
          {/* <div className="d-flex flex-wrap gap-3">
            {perfPlates && (
              <div>
                Plates ⏱ pre {perfPlates.timings.preprocess.toFixed(1)}ms · run{" "}
                {perfPlates.timings.run.toFixed(1)}ms · post{" "}
                {perfPlates.timings.post.toFixed(1)}ms · total{" "}
                {perfPlates.total?.toFixed(1)}ms
              </div>
            )}
            {perfFaces && (
              <span>
                Faces ⏱ pre {perfFaces.timings.preprocess.toFixed(1)}ms · run{" "}
                {perfFaces.timings.run.toFixed(1)}ms · post{" "}
                {perfFaces.timings.post.toFixed(1)}
                ms · total {perfFaces?.total.toFixed(1)}ms
              </span>
            )}
          </div> */}
        </Card.Footer>
      </Card>
    </Col>
  );
};

export default React.memo(Preview);
