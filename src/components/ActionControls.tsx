import React from "react";
import {
  Button,
  ButtonGroup,
  OverlayTrigger,
  Tooltip,
  Spinner,
  Overlay,
} from "react-bootstrap";
import { FaDownload, FaSync } from "react-icons/fa";
import { StepStates, StepsEnum, StepText } from "./demo/useDemo";

interface ActionControlsProps {
  onClickRefreshHandler: () => void;
  onClickDownloadHandler: () => void;
  busy?: boolean;
  disabled?: boolean;
  onDemoStepNext?: () => void;
  demoStepsArray?: StepStates[];
}

interface OverlayInjectedProps {
  arrowProps: Record<string, unknown>;
  show?: boolean;
  hasDoneInitialMeasure?: boolean;
  placement?: string;
  popper?: unknown;
  [key: string]: unknown;
}

export const ActionControls: React.FC<ActionControlsProps> = ({
  onClickRefreshHandler,
  onClickDownloadHandler,
  busy,
  disabled,
  onDemoStepNext,
  demoStepsArray,
}) => {
  const refreshBtnRef = React.useRef<HTMLButtonElement | null>(null);
  const downloadBtnRef = React.useRef<HTMLButtonElement | null>(null);

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
          aria-label="Scrub Image"
          onClick={onClickRefreshHandler}
          disabled={disabled ?? busy}
          ref={refreshBtnRef}
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
      <Overlay
        target={refreshBtnRef.current}
        show={
          !!(
            (demoStepsArray ?? false) &&
            demoStepsArray?.[StepsEnum.Scrub] === StepStates.Active
          )
        }
        placement="bottom"
      >
        {(props: OverlayInjectedProps) => {
          const { arrowProps, ...overlayProps } = props;
          delete overlayProps.show;
          delete overlayProps.hasDoneInitialMeasure;
          delete overlayProps.popper;
          delete overlayProps.placement;
          return (
            <div
              {...(overlayProps as Record<string, unknown>)}
              className="tooltip bs-tooltip-auto show"
              role="tooltip"
            >
              <div
                className="tooltip-arrow"
                {...(arrowProps as Record<string, unknown>)}
              />
              <div className="tooltip-inner">
                <div>{StepText[StepsEnum.Scrub]}</div>
                {demoStepsArray?.[StepsEnum.Scrub] === StepStates.Active && (
                  <div className="mt-1">
                    {!busy && (
                      <button
                        type="button"
                        disabled={!!busy}
                        className="btn btn-sm btn-warning text-blue text-decoration-none"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          onDemoStepNext?.();
                        }}
                      >
                        continue...
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>
          );
        }}
      </Overlay>

      {/* Download second (right) */}
      <OverlayTrigger
        placement="bottom"
        overlay={<Tooltip id="tt-dl">Download Scrubbed Image</Tooltip>}
      >
        <Button
          className="action-btn"
          size="sm"
          variant="outline-secondary"
          aria-label="Download scrubbed"
          onClick={onClickDownloadHandler}
          disabled={disabled ?? busy}
          ref={downloadBtnRef}
        >
          <FaDownload className="me-1" />
          <span className="d-none d-sm-inline">Download</span>
        </Button>
      </OverlayTrigger>
      <Overlay
        target={downloadBtnRef.current}
        show={
          !!(
            (demoStepsArray ?? false) &&
            demoStepsArray?.[StepsEnum.Download] === StepStates.Active
          )
        }
        placement="bottom"
      >
        {(props: OverlayInjectedProps) => {
          const { arrowProps, ...overlayProps } = props;
          delete overlayProps.show;
          delete overlayProps.hasDoneInitialMeasure;
          delete overlayProps.popper;
          delete overlayProps.placement;
          return (
            <div
              {...(overlayProps as Record<string, unknown>)}
              className="tooltip bs-tooltip-auto show"
              role="tooltip"
            >
              <div
                className="tooltip-arrow"
                {...(arrowProps as Record<string, unknown>)}
              />
              <div className="tooltip-inner">
                <div>Click to download your redacted image.</div>
                {demoStepsArray?.[StepsEnum.Download] === StepStates.Active && (
                  <div className="mt-1">
                    <button
                      type="button"
                      className="btn btn-sm btn-warning text-blue text-decoration-none"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        onDemoStepNext?.();
                      }}
                    >
                      Got it!
                    </button>
                  </div>
                )}
              </div>
            </div>
          );
        }}
      </Overlay>
    </ButtonGroup>
  );
};

export default React.memo(ActionControls);
