// src/__tests__/Preview.layout.spec.tsx
import React from "react";
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import Preview from "@/components/Preview";

describe("Preview layout", () => {
  it("renders image and canvas; sizing is handled by parent on load", () => {
    // Create correctly typed refs without using `any`
    const canvasEl = document.createElement("canvas");
    const canvasRef = {
      current: canvasEl,
    } as React.RefObject<HTMLCanvasElement>;
    const imgRef = {
      current: null as HTMLImageElement | null,
    } as React.RefObject<HTMLImageElement>;

    render(
      <Preview
        imgSize={{ w: 0, h: 0 }}
        setImgSize={() => {}}
        onClickRefreshHandler={() => {}}
        onClickDownloadHandler={() => {}} // ← required by PreviewProps
        canvasRef={canvasRef}
        detections={{ plates: 0, faces: 0 }}
        title="Preview"
        previewUrl="blob:test"
        badgeList={[]}
        perfPlates={null}
        perfFaces={null}
        imgRef={imgRef}
        canvasVisible={true}
      />
    );

    // Basic presence checks (actual sizing logic is in the parent after img load)
    const img = screen.getByRole("img");
    expect(img).toBeInTheDocument();
  });
});
