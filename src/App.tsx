// src/App.tsx
import { useEffect, useRef } from "react";
import { Container } from "react-bootstrap";
import { Title } from "./components/Title";
import { FaceBlur } from "./components/FaceBlur";
import { LicensePlateBlur } from "./components/LicensePlateBlur";

export function App() {
  const clearMsgTimeoutRef = useRef<number | null>(null);
  const timeoutRef = clearMsgTimeoutRef.current;

  useEffect(() => {
    return () => {
      if (timeoutRef) window.clearTimeout(timeoutRef);
    };
  }, [timeoutRef]);

  return (
    <Container className="py-3">
      <main style={{ padding: 16, maxWidth: 900, margin: "0 auto" }}>
        <Title />
        <LicensePlateBlur
          modelUrl="/models/license-plate-finetune-v1n.onnx"
          modelSize={640}
          confThresh={0.35}
          iouThresh={0.45}
          padRatio={0.2}
          blurRadius={14}
        />
        <FaceBlur />
      </main>
    </Container>
  );
}
