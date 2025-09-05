import React from "react";
import { Col, Card, Badge, Spinner } from "react-bootstrap";
import { FaImage, FaBolt, FaMicrochip, FaLaptop } from "react-icons/fa";
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
  imgRef,
  busy,
}) => {
  if (!imgRef) return <div>No image to preview.</div>;

  const chipClass = "badge-chip";

  const renderChip = (label: string) => {
    let Icon = FaMicrochip;
    if (/simd/i.test(label)) Icon = FaBolt;
    if (/device|on-?device/i.test(label)) Icon = FaLaptop;
    return (
      <Badge key={label} className={chipClass}>
        <Icon size={12} className="badge-icon" />
        {label}
      </Badge>
    );
  };

  return (
    <Col md={8}>
      <Card className={`shadow-sm border-0 ${busy ? "cursor-busy" : ""}`}>
        <Card.Header className="bg-light d-flex align-items-center justify-content-between">
          <div className="d-flex align-items-center gap-2 text-secondary">
            <FaImage className="text-secondary" />
            <span className="fw-semibold">{title}</span>
          </div>

          <div className="d-flex align-items-center gap-2">
            <div className="d-flex align-items-center gap-1">
              {badgeList.map((b) => renderChip(b))}
            </div>

            <ActionControls
              onClickRefreshHandler={onClickRefreshHandler}
              onClickDownloadHandler={onClickDownloadHandler}
              busy={busy || !previewUrl}
            />
          </div>
        </Card.Header>

        <div
          className="bg-body-tertiary position-relative"
          style={imgSize.w && imgSize.h ? { aspectRatio: `${imgSize.w} / ${imgSize.h}` } : undefined}
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
              const c = canvasRef.current as HTMLCanvasElement | null;
              if (c) {
                c.width = w;
                c.height = h;
              }
            }}
          />
          {busy && (
            <div className="position-absolute top-50 start-50 translate-middle">
              <Spinner
                animation="border"
                role="status"
                aria-label="processing"
              />
            </div>
          )}
          <canvas ref={canvasRef} className={`position-absolute top-0 start-0 w-100 h-100 fade-canvas ${canvasVisible ? "is-visible" : ""}`} />
        </div>
      </Card>
    </Col>
  );
};

export default React.memo(Preview);
