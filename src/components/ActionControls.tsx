import React from "react";
import { Button, Stack } from "react-bootstrap";
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
    <>
      <Stack direction="horizontal" gap={2} className="flex-wrap">
        <Button
          variant="outline-secondary"
          title="Download scrubbed"
          aria-label="Download scrubbed"
          onClick={onClickDownloadHandler}
          disabled={busy}
        >
          <FaDownload />
        </Button>
        <Button
          variant="outline-secondary"
          title="Refresh"
          aria-label="Refresh"
          onClick={onClickRefreshHandler}
          disabled={busy}
        >
          <FaSync />
        </Button>
      </Stack>
    </>
  );
};

export default React.memo(ActionControls);
