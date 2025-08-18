import { Button } from "react-bootstrap";

export function ActionButtons() {
  return (
    <div className="d-flex gap-2 my-3">
      <Button
        variant="secondary"
        onClick={download}
        disabled={!imageURL || busy}
      >
        Download Scrubbed Image
      </Button>
    </div>
  );
}
