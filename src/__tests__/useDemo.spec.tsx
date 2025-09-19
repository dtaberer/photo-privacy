import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  StepStates,
  StepsEnum,
  demoImage,
  useDemo,
} from "@/components/demo/useDemo";

const rafQueue: FrameRequestCallback[] = [];
const flushRaf = () => {
  while (rafQueue.length) {
    const cb = rafQueue.shift();
    cb?.(performance.now());
  }
};

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
    rafQueue.push(cb);
    return rafQueue.length;
  });
  vi.stubGlobal("cancelAnimationFrame", (id: number) => {
    if (rafQueue[id - 1]) rafQueue[id - 1] = () => {};
  });
});

afterEach(() => {
  rafQueue.splice(0, rafQueue.length);
  vi.unstubAllGlobals();
});

describe("useDemo", () => {
  const createParams = () => {
    let complete = false;
    let naturalWidth = 0;
    let naturalHeight = 0;
    const img = Object.defineProperties(document.createElement("img"), {
      complete: { get: () => complete },
      naturalWidth: { get: () => naturalWidth },
      naturalHeight: { get: () => naturalHeight },
    });
    const imgRef = { current: img } as React.RefObject<HTMLImageElement>;

    const setImageReady = (ready: boolean) => {
      complete = ready;
      naturalWidth = ready ? 120 : 0;
      naturalHeight = ready ? 80 : 0;
    };

    const params = {
      previewUrl: null as string | null,
      setPreviewUrl: vi.fn((url: string) => {
        params.previewUrl = url;
      }),
      setOrigName: vi.fn(),
      clearCanvas: vi.fn(),
      runDetection: vi.fn(),
      imgRef,
      setCanvasVisible: vi.fn(),
      setFacesOn: vi.fn(),
      setPlatesOn: vi.fn(),
      busy: false,
      canvasVisible: false,
      resetDetections: vi.fn(),
    };

    return { params, imgRef, setImageReady };
  };

  it("activates demo sequence when Demo image already loaded", () => {
    const { params, imgRef, setImageReady } = createParams();
    params.previewUrl = demoImage;
    setImageReady(true);

    const { result } = renderHook(() =>
      useDemo({
        previewUrl: params.previewUrl,
        setPreviewUrl: params.setPreviewUrl,
        setOrigName: params.setOrigName,
        clearCanvas: params.clearCanvas,
        runDetection: params.runDetection,
        imgRef,
        setCanvasVisible: params.setCanvasVisible,
        setFacesOn: params.setFacesOn,
        setPlatesOn: params.setPlatesOn,
        busy: false,
        canvasVisible: false,
        resetDetections: params.resetDetections,
      })
    );

    act(() => {
      result.current.onTryDemo();
    });

    flushRaf();

    expect(params.resetDetections).toHaveBeenCalled();
    expect(params.setCanvasVisible).toHaveBeenCalledWith(false);
    expect(params.runDetection).toHaveBeenCalledTimes(1);
    expect(result.current.demoMode).toBe(true);
    expect(result.current.demoStepsArray[StepsEnum.Scrub]).toBe(
      StepStates.Active
    );
  });

  it("queues detection until image reports ready", () => {
    const { params, imgRef, setImageReady } = createParams();
    params.previewUrl = null;

    let currentPreview: string | null = params.previewUrl;
    const rerenderQueue: (() => void)[] = [];

    const setPreviewUrl = vi.fn((url: string) => {
      currentPreview = url;
      params.previewUrl = url;
      rerenderQueue.forEach((fn) => fn());
    });

    const hook = renderHook(
      ({ previewUrl }: { previewUrl: string | null }) =>
        useDemo({
          previewUrl,
          setPreviewUrl,
          setOrigName: params.setOrigName,
          clearCanvas: params.clearCanvas,
          runDetection: params.runDetection,
          imgRef,
          setCanvasVisible: params.setCanvasVisible,
          setFacesOn: params.setFacesOn,
          setPlatesOn: params.setPlatesOn,
          busy: false,
          canvasVisible: false,
          resetDetections: params.resetDetections,
        }),
      { initialProps: { previewUrl: currentPreview as string | null } }
    );

    rerenderQueue.push(() => {
      hook.rerender({ previewUrl: currentPreview as string | null });
    });

    act(() => {
      hook.result.current.onTryDemo();
    });

    expect(setPreviewUrl).toHaveBeenCalledWith(demoImage);
    expect(params.setOrigName).toHaveBeenCalledWith("demo.jpg");
    expect(params.clearCanvas).toHaveBeenCalled();

    act(() => {
      setImageReady(true);
      hook.rerender({ previewUrl: demoImage as string | null });
    });
    act(() => {
      flushRaf();
    });

    expect(params.runDetection).toHaveBeenCalled();
    expect(hook.result.current.demoStepsArray[StepsEnum.Scrub]).toBe(
      StepStates.Active
    );
  });

  it("advances demo steps via onDemoStepNext and reset works", () => {
    const { params, imgRef, setImageReady } = createParams();
    setImageReady(true);
    const { result } = renderHook(() =>
      useDemo({
        previewUrl: params.previewUrl,
        setPreviewUrl: params.setPreviewUrl,
        setOrigName: params.setOrigName,
        clearCanvas: params.clearCanvas,
        runDetection: params.runDetection,
        imgRef,
        setCanvasVisible: params.setCanvasVisible,
        setFacesOn: params.setFacesOn,
        setPlatesOn: params.setPlatesOn,
        busy: false,
        canvasVisible: false,
        resetDetections: params.resetDetections,
      })
    );

    act(() => {
      result.current.onDemoStepNext();
    });

    act(() => {
      flushRaf();
    });

    expect(result.current.demoStepsArray[0]).toBe(StepStates.Done);
    expect(result.current.demoStepsArray[1]).toBe(StepStates.Active);

    act(() => {
      result.current.resetDemo();
    });

    act(() => {
      flushRaf();
    });

    expect(result.current.demoMode).toBe(false);
    expect(
      result.current.demoStepsArray.every((s) => s === StepStates.Inactive)
    ).toBe(true);
  });
});
