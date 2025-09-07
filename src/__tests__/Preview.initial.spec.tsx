import React from "react";
import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import Preview from "@/components/Preview";

describe("Preview initial sizing", () => {
  it("applies initial classes and heights before image load", () => {
    const canvasEl = document.createElement("canvas");
    const canvasRef = { current: canvasEl } as React.RefObject<HTMLCanvasElement>;
    const imgRef = { current: null as HTMLImageElement | null } as React.RefObject<HTMLImageElement>;

    const { container } = render(
      <Preview
        imgSize={{ w: 0, h: 0 }}
        setImgSize={() => {}}
        onClickRefreshHandler={() => {}}
        onClickDownloadHandler={() => {}}
        canvasRef={canvasRef}
        title="Preview"
        previewUrl={null}
        badgeList={["SIMD"]}
        imgRef={imgRef}
        canvasVisible={false}
      />
    );

    const card = container.querySelector(".preview-card") as HTMLElement;
    expect(card).toBeTruthy();
    expect(card.classList.contains("is-initial")).toBe(true);
    // Inline style should set an initial height
    expect(card.getAttribute("style") || "").toMatch(/height:\s*(84%|70vh)/);

    const stage = container.querySelector(".preview-stage") as HTMLElement;
    expect(stage).toBeTruthy();
    expect(stage.getAttribute("style") || "").toMatch(/height:\s*100%/);
  });
});
