import { Container } from "react-bootstrap";
import Header from "./components/Header";
import PrivacyScrubber from "./components/PrivacyScrubber"; // use your path

import { useEffect, useRef } from "react";

export function App() {
  const timeoutRef = useRef<number | null>(null);

  useEffect(() => {
    const timeoutId = timeoutRef.current;
    return () => {
      if (timeoutId) window.clearTimeout(timeoutId);
    };
  }, []);

  return (
    <Container fluid>
      <div className="bg-light min-vh-100">
        {/* Ensure Bootstrap CSS is present in the preview */}
        <link
          rel="stylesheet"
          href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/css/bootstrap.min.css"
        />
        <Container className="mt-n4 mb-5">
          <Header />
          <PrivacyScrubber />
        </Container>
      </div>
    </Container>
  );
}
