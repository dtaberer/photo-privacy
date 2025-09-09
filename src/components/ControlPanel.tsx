import React, { memo, useId } from "react";
import { Card, Form, Badge, Overlay } from "react-bootstrap";
import { DemoSteps } from "./constants";

export type ControlPanelProps = {
  controlName: string;
  count?: number;
  blurVal: number;
  setBlurVal: (v: number) => void;
  confVal: number;
  setThreshVal: (v: number) => void;
  featherVal: number;
  setFeatherVal: (v: number) => void;
  busy?: boolean;
  showBlurNudge?: boolean;
  onBlurInteract?: () => void;
  // Optional: show a small Next link inside the Blur tooltip
  blurNudgeNextLabel?: string;
  onBlurNudgeNext?: () => void;
  // Optional: custom text for Blur tooltip
  blurNudgeText?: string;
  // Optional: show tooltip for Filter slider
  showFilterNudge?: boolean;
  // Optional: add Next link to Filter tooltip
  filterNudgeNextLabel?: string;
  onFilterNudgeNext?: () => void;
  // Optional: show tooltip for Feather slider
  showFeatherNudge?: boolean;
  // Optional: custom text for Feather tooltip
  featherNudgeText?: string;
  // Optional: add Next link to Feather tooltip
  featherNudgeNextLabel?: string;
  onFeatherNudgeNext?: () => void;
};

interface OverlayInjectedProps {
  arrowProps: Record<string, unknown>;
  show?: boolean;
  hasDoneInitialMeasure?: boolean;
  placement?: string;
  popper?: unknown;
  [key: string]: unknown;
}

function ControlPanel({
  controlName,
  count = 0,
  blurVal,
  setBlurVal,
  confVal,
  setThreshVal,
  featherVal,
  setFeatherVal,
  busy = false,
  showBlurNudge = false,
  onBlurInteract,
  blurNudgeNextLabel,
  onBlurNudgeNext,
  blurNudgeText,
  showFilterNudge,
  filterNudgeNextLabel,
  onFilterNudgeNext,
  showFeatherNudge,
  featherNudgeText,
  featherNudgeNextLabel,
  onFeatherNudgeNext,
}: ControlPanelProps) {
  const blurId = useId();
  const confId = useId();
  const featherId = useId();
  const blurRef = React.useRef<HTMLInputElement | null>(null);
  const confRef = React.useRef<HTMLInputElement | null>(null);
  const featherRef = React.useRef<HTMLInputElement | null>(null);

  return (
    <Card className="shadow-sm border-0 mb-3 control-panel-card">
      <Card.Body>
        <div className="d-flex align-items-center justify-content-between mb-2">
          <Card.Title as="p" className="mb-0">
            {controlName}
          </Card.Title>
          <Badge
            bg="secondary"
            className="bg-opacity-10 border border-secondary border-opacity-25 px-2 py-1 small"
          >
            {count}
          </Badge>
        </div>

        <div className="control-row my-2">
          <label htmlFor={blurId} className="mb-0">
            Blur Opacity
          </label>
          <div className="control-slider">
            <Form.Range
              id={blurId}
              min={1}
              max={80}
              step={1}
              value={blurVal}
              disabled={busy}
              onChange={(e) => {
                setBlurVal(Number(e.currentTarget.value));
                onBlurInteract?.();
              }}
              className="form-range themed-range"
              ref={blurRef as React.RefObject<HTMLInputElement>}
              style={{
                // @ts-expect-error CSS custom props for progress fill
                "--min": 1,
                "--max": 80,
                "--value": blurVal,
                "--bs-form-range-track-height": "8px",
                "--bs-form-range-track-bg": "#e2e8f0",
              }}
            />
          </div>
          <Overlay
            target={blurRef.current}
            show={!!showBlurNudge}
            placement="top"
          >
            {(props: OverlayInjectedProps) => {
              const { arrowProps, ...overlayProps } = props;
              delete overlayProps.show;
              delete overlayProps.hasDoneInitialMeasure;
              delete overlayProps.popper;
              delete overlayProps.placement;
              return (
                <div
                  id="tt-blur-nudge"
                  {...(overlayProps as Record<string, unknown>)}
                  className="tooltip bs-tooltip-auto show"
                  role="tooltip"
                >
                  <div
                    className="tooltip-arrow"
                    {...(arrowProps as Record<string, unknown>)}
                  />
                  <div className="tooltip-inner">
                    <div>
                      {blurNudgeText ?? (
                        <span>
                          For {controlName}
                          <br /> {DemoSteps[1]}
                        </span>
                      )}
                    </div>
                    {onBlurNudgeNext && (
                      <div className="mt-1">
                        <button
                          type="button"
                          className="btn btn-link btn-sm p-0 text-white text-decoration-none"
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            onBlurNudgeNext();
                          }}
                        >
                          {blurNudgeNextLabel ?? "next >>"}
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              );
            }}
          </Overlay>
          <span className="value-badge">
            <span aria-hidden className="num">
              {blurVal}
            </span>{" "}
            <span aria-hidden className="unit">
              px
            </span>
            <span className="visually-hidden">{blurVal} px</span>
          </span>
        </div>

        <div className="control-row my-2">
          <label htmlFor={confId} className="mb-0">
            Filter
          </label>
          <div className="control-slider">
            <Form.Range
              id={confId}
              min={0}
              max={100}
              step={1}
              value={Math.round(confVal * 100)}
              disabled={busy}
              onChange={(e) =>
                setThreshVal(Number(e.currentTarget.value) / 100)
              }
              className="form-range themed-range"
              ref={confRef as React.RefObject<HTMLInputElement>}
              style={{
                // @ts-expect-error CSS custom props for progress fill
                "--min": 0,
                "--max": 100,
                "--value": Math.round(confVal * 100),
                "--bs-form-range-track-height": "8px",
                "--bs-form-range-track-bg": "#e2e8f0",
              }}
            />
          </div>
          <Overlay
            target={confRef.current}
            show={!!showFilterNudge}
            placement="top"
          >
            {(props: OverlayInjectedProps) => {
              const { arrowProps, ...overlayProps } = props;
              delete overlayProps.show;
              delete overlayProps.hasDoneInitialMeasure;
              delete overlayProps.popper;
              delete overlayProps.placement;
              return (
                <div
                  id="tt-filter-nudge"
                  {...(overlayProps as Record<string, unknown>)}
                  className="tooltip bs-tooltip-auto show"
                  role="tooltip"
                >
                  <div
                    className="tooltip-arrow"
                    {...(arrowProps as Record<string, unknown>)}
                  />
                  <div className="tooltip-inner">
                    <div>
                      <span>
                        For {controlName}
                        <br /> {DemoSteps[2]}
                      </span>
                    </div>
                    {onFilterNudgeNext && (
                      <div className="mt-1">
                        <button
                          type="button"
                          className="btn btn-link btn-sm p-0 text-white text-decoration-none"
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            onFilterNudgeNext();
                          }}
                        >
                          {filterNudgeNextLabel ?? "next >>"}
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              );
            }}
          </Overlay>
          <span className="value-badge">
            <span aria-hidden className="num">
              {Math.round(confVal * 100)}
            </span>{" "}
            <span aria-hidden className="unit">
              %
            </span>
            <span className="visually-hidden">
              {Math.round(confVal * 100)} %
            </span>
          </span>
        </div>

        <div className="control-row my-2">
          <label htmlFor={featherId} className="mb-0">
            Feather
          </label>
          <div className="control-slider">
            <Form.Range
              id={featherId}
              min={0}
              max={100}
              step={1}
              value={featherVal}
              disabled={busy}
              onChange={(e) => setFeatherVal(Number(e.currentTarget.value))}
              className="form-range themed-range"
              ref={featherRef as React.RefObject<HTMLInputElement>}
              style={{
                // @ts-expect-error CSS custom props for progress fill
                "--min": 0,
                "--max": 100,
                "--value": featherVal,
                "--bs-form-range-track-bg": "#e2e8f0",
              }}
            />
          </div>
          <Overlay
            target={featherRef.current}
            show={!!showFeatherNudge}
            placement="top"
          >
            {(props: OverlayInjectedProps) => {
              const { arrowProps, ...overlayProps } = props;
              delete overlayProps.show;
              delete overlayProps.hasDoneInitialMeasure;
              delete overlayProps.popper;
              delete overlayProps.placement;
              return (
                <div
                  id="tt-feather-nudge"
                  {...(overlayProps as Record<string, unknown>)}
                  className="tooltip bs-tooltip-auto show"
                  role="tooltip"
                >
                  <div
                    className="tooltip-arrow"
                    {...(arrowProps as Record<string, unknown>)}
                  />
                  <div className="tooltip-inner">
                    <div>
                      {featherNudgeText ?? (
                        <span>
                          For {controlName}
                          <br />
                          {DemoSteps[3]}
                        </span>
                      )}
                    </div>
                    {onFeatherNudgeNext && (
                      <div className="mt-1">
                        <button
                          type="button"
                          className="btn btn-link btn-sm p-0 text-white text-decoration-none"
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            onFeatherNudgeNext();
                          }}
                        >
                          {featherNudgeNextLabel ?? "next >>"}
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              );
            }}
          </Overlay>
          <span className="value-badge">
            <span aria-hidden className="num">
              {Math.round(featherVal)}
            </span>{" "}
            <span aria-hidden className="unit">
              px
            </span>
            <span className="visually-hidden">{Math.round(featherVal)}px</span>
          </span>
        </div>
      </Card.Body>
    </Card>
  );
}

export default memo(ControlPanel);
