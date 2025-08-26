import React from "react";
import { Col, Card, Badge } from "react-bootstrap";
import { FaImage } from "react-icons/fa";
import { DetectTimings } from "./utils/detectors";

interface PreviewProps {
  onClickRefreshHandler: () => void;
  onClickDownloadHandler: () => void;
  imgSize: { w: number; h: number };
  setImgSize: React.Dispatch<React.SetStateAction<{ w: number; h: number }>>;
  canvasVisible: boolean;
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  detections: { plates: number; faces: number };
  title: string;
  previewUrl: string | null;
  badgeList: string[];
  perfPlates: DetectTimings | null;
  perfFaces: DetectTimings | null;
  imgRef?: React.RefObject<HTMLImageElement | null>;
}

const Preview: React.FC<PreviewProps> = ({
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
              previewUrl ||
              "https://images.unsplash.com/photo-1549923746-c502d488b3ea?q=80&w=1600&auto=format&fit=crop"
            }
            alt="preview"
            className="w-100 h-100 object-fit-cover"
            crossOrigin="anonymous"
            onLoad={(e) =>
              setImgSize({
                w: e.currentTarget.naturalWidth,
                h: e.currentTarget.naturalHeight,
              })
            }
          />
          <canvas
            ref={canvasRef}
            className="position-absolute top-0 start-0 w-100 h-100"
            style={{ visibility: canvasVisible ? "visible" : "hidden" }}
          />
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
                Plates ⏱ pre {perfPlates.preprocess.toFixed(1)}ms · run{" "}
                {perfPlates.run.toFixed(1)}ms · post{" "}
                {perfPlates.post.toFixed(1)}ms · total{" "}
                {perfPlates.total.toFixed(1)}ms
              </div>
            )}
            {perfFaces && (
              <span>
                Faces ⏱ pre {perfFaces.preprocess.toFixed(1)}ms · run{" "}
                {perfFaces.run.toFixed(1)}ms · post {perfFaces.post.toFixed(1)}
                ms · total {perfFaces.total.toFixed(1)}ms
              </span>
            )}
          </div>
        </Card.Footer>
      </Card>
    </Col>
  );
};

export default React.memo(Preview);
