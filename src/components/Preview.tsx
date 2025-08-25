import React from "react";
import { Col, Card, Badge, Spinner, Button } from "react-bootstrap";
import { FaImage } from "react-icons/fa";
import { DetectTimings } from "@/types/detectors";

interface PreviewProps {
  onClickRefreshHandler: () => void;
  imgSize: { w: number; h: number };
  setImgSize: React.Dispatch<React.SetStateAction<{ w: number; h: number }>>;
  canvasVisible: boolean;
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  detections: { plates: number; faces: number };
  title: string;
  previewUrl: string | null;
  badgeList: ReadonlyArray<string>;
  perfPlates: DetectTimings | null;
  perfFaces: DetectTimings | null;
  imgRef?: React.RefObject<HTMLImageElement | null>;
  busy: boolean;
  status: string;
}

export const Preview: React.FC<PreviewProps> = ({
  onClickRefreshHandler,
  imgSize,
  setImgSize,
  canvasVisible,
  canvasRef,
  detections,
  title,
  previewUrl,
  badgeList,
  perfPlates,
  perfFaces,
  imgRef,
  busy,
  status,
}) => {
  if (!imgRef) {
    return <div>No image to preview.</div>;
  }

  return (
    <Col md={8}>
      <Card className="shadow-sm border-0">
        <Card.Header className="bg-light d-flex align-items-center justify-content-between">
          <div className="d-flex align-items-center gap-2 text-secondary">
            <FaImage className="text-secondary" />
            <span className="fw-semibold">{title}</span>
          </div>
          <div className="d-flex align-items-center gap-2">
            <span className="small text-secondary text-truncate" title={status}>
              {status}
            </span>
            <Button
              size="sm"
              variant="outline-secondary"
              onClick={onClickRefreshHandler}
              disabled={busy || !previewUrl}
            >
              Refresh
            </Button>
            <div className="d-flex align-items-center gap-1 ms-2">
              {badgeList.map((b) => (
                <Badge
                  key={b}
                  bg="secondary"
                  className="bg-opacity-10 text-secondary border border-secondary border-opacity-25"
                >
                  {b}
                </Badge>
              ))}
            </div>
          </div>
        </Card.Header>

        <div
          className="position-relative"
          style={{ aspectRatio: `${imgSize.w}/${imgSize.h}` }}
        >
          <img
            ref={imgRef}
            src={previewUrl ?? ""}
            alt="preview"
            className="w-100 h-100"
          />
          <canvas
            ref={canvasRef}
            className="position-absolute top-0 start-0 w-100"
            style={{
              height: "100%",
              visibility: canvasVisible ? "visible" : "hidden",
            }}
          />
          {busy && (
            <div
              className="position-absolute top-50 start-50 translate-middle d-flex align-items-center justify-content-center"
              style={{ zIndex: 2, pointerEvents: "none" }}
              aria-label="Processing image"
            >
              <Spinner animation="border" role="status" />
            </div>
          )}
        </div>

        <Card.Footer className="d-flex flex-column gap-1 small text-secondary">
          <div className="d-flex justify-content-between">
            <span>
              Detections: plates {detections.plates} · faces {detections.faces}
            </span>
          </div>
          <div className="d-flex flex-wrap gap-3">
            {perfPlates && (
              <div>
                Plates ⏱ pre {perfPlates.preprocess?.toFixed(1) ?? "N/A"}ms ·
                run {perfPlates.run?.toFixed(1) ?? "N/A"}ms · post{" "}
                {perfPlates.post?.toFixed(1) ?? "N/A"}ms · total{" "}
                {perfPlates.total?.toFixed(1) ?? "N/A"}ms
              </div>
            )}
            {perfFaces && (
              <span>
                Faces ⏱ pre {perfFaces.preprocess?.toFixed(1) ?? "N/A"}ms · run{" "}
                {perfFaces.run?.toFixed(1) ?? "N/A"}ms · post{" "}
                {perfFaces.post?.toFixed(1) ?? "N/A"}
                ms · total {perfFaces.total?.toFixed(1) ?? "N/A"}ms
              </span>
            )}
          </div>
        </Card.Footer>
      </Card>
    </Col>
  );
};

export default Preview;
