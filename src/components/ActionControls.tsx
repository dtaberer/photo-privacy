import React from "react";
import { Button, Stack } from "react-bootstrap";
import { FaDownload, FaSync } from "react-icons/fa";

interface ActionControlsProps {
  onClickRefreshHandler: () => void;
  onClickDownloadHandler: () => void;
}

export const ActionControls = React.memo(function ActionControls({
  onClickRefreshHandler,
  onClickDownloadHandler,
}: ActionControlsProps) {
  return (
    <>
      <Stack direction="horizontal" gap={2} className="mt-2 flex-wrap mb-5">
        <Button
          variant="outline-secondary"
          title="Download"
          aria-label="Download"
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
});

export default ActionControls;
