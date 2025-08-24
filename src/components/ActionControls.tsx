import React from "react";
import { Button, Stack } from "react-bootstrap";
import { FaDownload, FaSync } from "react-icons/fa";

interface ActionControlsProps {
  onClickRefreshHandler: () => void;
  onClickDownloadHandler: () => void;
}

export const ActionControls: React.FC<ActionControlsProps> = ({
  onClickRefreshHandler,
  onClickDownloadHandler,
}) => {
  return (
    <>
      <Stack direction="horizontal" gap={2} className="mt-2 flex-wrap">
        <Button
          variant="primary"
          className="d-inline-flex align-items-center gap-2"
          onClick={onClickRefreshHandler}
        >
          <FaSync /> Run detection
        </Button>
        <Button
          variant="outline-secondary"
          title="Download scrubbed"
          aria-label="Download scrubbed"
          onClick={onClickDownloadHandler}
        >
          <FaDownload />
        </Button>
        <Button
          variant="outline-secondary"
          title="Refresh"
          aria-label="Refresh"
          onClick={onClickRefreshHandler}
        >
          <FaSync />
        </Button>
      </Stack>
    </>
  );
};

export default ActionControls;
