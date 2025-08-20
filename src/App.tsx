// src/App.tsx
import { useEffect, useRef } from "react";
import { Container } from "react-bootstrap";
import AIRecognition from "./Components/AIRecognition";

export default function App() {
  const clearMsgTimeoutRef = useRef<number | null>(null);
  const timeoutRef = clearMsgTimeoutRef.current;

  useEffect(() => {
    return () => {
      if (timeoutRef) window.clearTimeout(timeoutRef);
    };
  }, [timeoutRef]);

  return (
    <Container className="py-3">
      <AIRecognition />

      {/* App-wide style overrides. Why: brand color on active tabs & form labels styling per request. */}
      <style>{`
        .pps-tabs .nav-tabs .nav-link.active,
        .nav-tabs .nav-link.active {
          color: #072a57;
          font-weight: 600;
        }
        .form-check-label,
        .form-label {
          font-weight: 600;
          font-size: 11pt;
          color: #2e4f6ccc;
        }
      `}</style>
    </Container>
  );
}
