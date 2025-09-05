import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { FileLoader } from "@/components/FileLoader";

describe("FileLoader interactions", () => {
  it("handles paste of an image file", () => {
    const onPick = vi.fn();
    const setDrag = vi.fn();
    render(
      <FileLoader
        onFilePickHandler={onPick}
        dragOver={false}
        setDragOver={setDrag}
        busy={false}
      />
    );

    const f = new File(["abc"], "pic.png", { type: "image/png" });
    const ev = new Event("paste");
    Object.defineProperty(ev, "clipboardData", {
      value: {
        items: [
          {
            type: "image/png",
            getAsFile: () => f,
          },
        ],
      },
    });
    window.dispatchEvent(ev);

    expect(onPick).toHaveBeenCalledWith(f);
  });

  it("handles drop of a file and click selection", () => {
    const onPick = vi.fn();
    const setDrag = vi.fn();
    render(
      <FileLoader
        onFilePickHandler={onPick}
        dragOver={false}
        setDragOver={setDrag}
        busy={false}
      />
    );

    // Drop
    const label = screen.getByText(/drag & drop/i).closest("label")!;
    const file = new File(["abc"], "photo.jpg", { type: "image/jpeg" });
    const dropEv = new Event("drop", { bubbles: true } as EventInit) as unknown as DragEvent;
    Object.defineProperty(dropEv, "dataTransfer", {
      value: { files: [file] },
    });
    fireEvent(label, dropEv);
    expect(onPick).toHaveBeenCalledWith(file);

    // Change via hidden input
    const input = label.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [file] } });
    expect(onPick).toHaveBeenCalledTimes(2);
  });
});

