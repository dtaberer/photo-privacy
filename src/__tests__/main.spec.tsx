import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const AppMock = vi.fn(() => <div data-testid="app" />);

vi.mock("@/App", () => ({
  __esModule: true,
  App: AppMock,
}));

const renderMock = vi.fn();
const createRootMock = vi.fn(() => ({ render: renderMock }));

vi.mock("react-dom/client", () => ({
  createRoot: createRootMock,
}));

const setupOrtMock = vi.fn();

vi.mock("@/ort-setup", () => ({
  __esModule: true,
  setupOrt: setupOrtMock,
  ort: {},
  createOrtSession: vi.fn(),
  ortForceBasicWasm: vi.fn(),
}));

describe("main entrypoint", () => {
  beforeEach(() => {
    vi.resetModules();
    renderMock.mockClear();
    createRootMock.mockClear();
    setupOrtMock.mockClear();
    document.body.innerHTML = "";
  });

  it("initializes ORT and renders the App inside StrictMode", async () => {
    const root = document.createElement("div");
    root.id = "root";
    document.body.appendChild(root);

    await import("@/main");

    expect(setupOrtMock).toHaveBeenCalledTimes(1);
    expect(createRootMock).toHaveBeenCalledWith(root);
    expect(renderMock).toHaveBeenCalledTimes(1);

    const [element] = renderMock.mock.calls[0] ?? [];
    expect(React.isValidElement(element)).toBe(true);
    expect(element.type).toBe(React.StrictMode);
    const child = React.Children.only(element.props.children);
    expect(child.type).toBe(AppMock);
  });

  it("throws when root element missing", async () => {
    await expect(import("@/main"))
      .rejects.toThrow(/Root element #root not found/);
  });
});
