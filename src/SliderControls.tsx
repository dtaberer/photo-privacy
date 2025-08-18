import { Stack, Card, Form } from "react-bootstrap";
import { SliderControl } from "./SliderControl";

export function SliderControls() {
  return (
    <Card className="mb-3 shadow-sm border-0" style={{ overflow: "hidden" }}>
      <Card.Header className="bg-light fw-semibold">
        Redaction settings
      </Card.Header>
      <Card.Body>
        <div className="mt-2">
          <SliderControl
            id="s-blur"
            label="Blur amount (px)"
            min={0}
            max={40}
            step={1}
            value={blurPx}
            onChange={setBlurPx}
            unit="px"
            disabled={busy || usePixelate}
          />
          {usePixelate && (
            <SliderControl
              id="s-block"
              label="Pixel block size"
              min={4}
              max={60}
              step={2}
              value={blockSize}
              onChange={setBlockSize}
              unit="px"
              disabled={busy}
            />
          )}
          <Stack
            direction="horizontal"
            gap={3}
            className="align-items-center mt-3"
          >
            <Form.Label
              htmlFor="s-overlay"
              className="mb-0"
              style={{ minWidth: 160 }}
            >
              Overlay color / opacity
            </Form.Label>
            <Form.Control
              id="s-overlay-color"
              type="color"
              aria-label="Overlay color"
              value={coverColor}
              title="Overlay color"
              onChange={(e) => setCoverColor(e.target.value)}
              style={{ width: 56, height: 32, padding: 0 }}
              disabled={busy}
            />
            <Form.Range
              id="s-overlay"
              className="flex-grow-1"
              min={0}
              max={95}
              step={5}
              value={Math.round(coverAlpha * 100)}
              onChange={(e) =>
                setCoverAlpha(Number(e.currentTarget.value) / 100)
              }
              disabled={busy}
            />
            <span style={{ width: 60, textAlign: "right" }}>{`${Math.round(
              coverAlpha * 100
            )}%`}</span>
          </Stack>
          <small className="text-muted d-block mt-2">
            Overlay adds a solid tint on top of blurred/pixelated regions for
            stronger obfuscation.
          </small>
        </div>
      </Card.Body>
    </Card>
  );
}
