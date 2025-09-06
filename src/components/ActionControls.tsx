import React from "react";
import {
  Button,
  ButtonGroup,
  OverlayTrigger,
  Tooltip,
  Spinner,
} from "react-bootstrap";
import { FaDownload, FaSync } from "react-icons/fa";

interface ActionControlsProps {
  onClickRefreshHandler: () => void;
  onClickDownloadHandler: () => void;
  busy?: boolean;
}

export const ActionControls: React.FC<ActionControlsProps> = ({
  onClickRefreshHandler,
  onClickDownloadHandler,
  busy,
}) => {
  return (
    <ButtonGroup aria-label="Preview actions" className="action-btn-group">
      {/* Scrub first (left) */}
      <OverlayTrigger
        placement="bottom"
        overlay={<Tooltip id="tt-refresh">Refresh</Tooltip>}
      >
        <Button
          className="action-btn"
          size="sm"
          variant="outline-secondary"
          aria-label="Refresh"
          onClick={onClickRefreshHandler}
          disabled={busy}
        >
          {busy ? (
            <Spinner
              as="span"
              animation="border"
              role="status"
              aria-hidden
              size="sm"
              className="me-1"
            />
          ) : (
            <FaSync className="me-1" />
          )}
          <span className="d-none d-sm-inline">Scrub Image</span>
        </Button>
      </OverlayTrigger>

      {/* Download second (right) */}
      <OverlayTrigger
        placement="bottom"
        overlay={<Tooltip id="tt-dl">Download scrubbed</Tooltip>}
      >
        <Button
          className="action-btn"
          size="sm"
          variant="outline-secondary"
          aria-label="Download scrubbed"
          onClick={onClickDownloadHandler}
          disabled={busy}
        >
          <FaDownload className="me-1" />
          <span className="d-none d-sm-inline">Download</span>
        </Button>
      </OverlayTrigger>
    </ButtonGroup>
  );
};

export default React.memo(ActionControls);
