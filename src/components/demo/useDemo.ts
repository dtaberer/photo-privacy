import { useState, useRef, useCallback, useEffect } from "react";
import demoImageSrc from "../../assets/demo1.jpg";
import demoImage2Src from "../../assets/demo2.jpg";
export const demoImage = demoImageSrc;
export const demoImage2 = demoImage2Src;

export const enum StepStates {
  Inactive,
  Active,
  Done,
}

export const enum StepsEnum {
  Scrub,
  FaceBlur,
  FaceFilter,
  FaceFeather,
  PlateBlur,
  PlateFilter,
  PlateFeather,
  Download,
}

export const StepText: Partial<Record<StepsEnum, string>> = {
  [StepsEnum.Scrub]:
    "After loading your image, click the Scrub Image button to start the redaction process. \
  This normally takes around 8-10 seconds to complete detection.",

  [StepsEnum.FaceBlur]:
    "Select the 'Blur Opacity' to adjust the density and obscurity level of the blurred region. \
  Try it!",

  [StepsEnum.FaceFilter]:
    "The Filter control changes the level of sensitivity of detection and is driven by confidence thresholds. \
  It can drastically cut down the noise levels, but may also miss some distant or obscured subjects. \
  Try it!",

  [StepsEnum.FaceFeather]:
    "The Feather control adjusts the softness of the edges of the redacted areas. \
  Increasing the feathering can help blend the redacted areas more naturally into the background. \
  Try it!",

  [StepsEnum.Download]:
    "When you are ready to download your redacted image, click the Download button. \
  Your browser will prompt you to save the image file to your device.",
};

StepText[StepsEnum.PlateBlur] = StepText[StepsEnum.FaceBlur];
StepText[StepsEnum.PlateFilter] = StepText[StepsEnum.FaceFilter];
StepText[StepsEnum.PlateFeather] = StepText[StepsEnum.FaceFeather];

interface DemoParams {
  previewUrl: string | null;
  setPreviewUrl: (url: string) => void;
  setOrigName: (name: string) => void;
  clearCanvas: () => void;
  runDetection: () => void;
  imgRef: React.RefObject<HTMLImageElement>;
  setCanvasVisible: React.Dispatch<React.SetStateAction<boolean>>;
  setFacesOn: (v: boolean) => void;
  setPlatesOn: (v: boolean) => void;
  busy: boolean;
  canvasVisible: boolean;
  resetDetections: () => void;
}

export interface UseDemoReturn {
  demoMode: boolean;
  demoStep: number;
  onTryDemo: () => void;
  resetDemo: () => void;
  onDemoStepNext: () => void;
  demoStepsArray: StepStates[];
}

export function useDemo({
  previewUrl,
  setPreviewUrl,
  setOrigName,
  clearCanvas,
  runDetection,
  imgRef,
  setCanvasVisible,
  setFacesOn,
  setPlatesOn,
  resetDetections,
}: DemoParams): UseDemoReturn {
  const [demoMode, setDemoMode] = useState(false);
  const [demoStep, setDemoStep] = useState(0);
  const [demoStepsArray, setDemoStepsArray] = useState<StepStates[]>(
    new Array(8).fill(StepStates.Inactive)
  );
  const demoPendingRef = useRef(false);

  const resetDemo = useCallback(() => {
    setDemoMode(false);
    setDemoStep(0);
    setDemoStepsArray(new Array(8).fill(StepStates.Inactive));
  }, []);

  const onTryDemo = useCallback(() => {
    setDemoMode(true);
    setDemoStep(0);
    resetDetections();
    setCanvasVisible(false);
    clearCanvas();
    setFacesOn(true);
    setPlatesOn(true);

    if (previewUrl === demoImage) {
      if (
        imgRef.current &&
        imgRef.current.complete &&
        imgRef.current.naturalWidth > 0
      )
        setDemoStepsArray((prev) => {
          const newArray = [...prev];
          newArray[StepsEnum.Scrub] = StepStates.Active;
          return newArray;
        });

      runDetection();
    } else {
      demoPendingRef.current = true;
      setOrigName("demo.jpg");
      setPreviewUrl(demoImage);
    }
  }, [
    resetDetections,
    setCanvasVisible,
    clearCanvas,
    setFacesOn,
    setPlatesOn,
    previewUrl,
    imgRef,
    runDetection,
    setOrigName,
    setPreviewUrl,
  ]);

  // When Demo is triggered in production, the image is loaded asynchronously.
  // Auto-run detection as soon as the image element reports ready.
  useEffect(() => {
    if (!demoMode) return;
    if (!demoPendingRef.current) return;

    let raf = 0;
    let tries = 0;
    const tick = () => {
      const el = imgRef.current;
      if (el && el.complete && el.naturalWidth > 0) {
        setDemoStepsArray((prev) => {
          const newArray = [...prev];
          newArray[StepsEnum.Scrub] = StepStates.Active;
          return newArray;
        });
        runDetection();
        demoPendingRef.current = false;
        return;
      }
      if (tries++ < 90) {
        // ~1.5s max wait at 60fps
        raf = requestAnimationFrame(tick);
      } else {
        // give up to avoid infinite loop; user can click Scrub manually
        demoPendingRef.current = false;
      }
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [demoMode, previewUrl, imgRef, runDetection]);

  const onDemoStepNext = useCallback(() => {
    setDemoStepsArray((prev) => {
      // Compute the next step index based on *current* demoStep
      const nextStep = demoStep + 1;

      const newArray = [...prev];
      newArray[demoStep] = StepStates.Done;
      if (nextStep < newArray.length) {
        newArray[nextStep] = StepStates.Active;
      }
      return newArray;
    });

    // advance the step counter
    setDemoStep((s) => s + 1);
  }, [demoStep]);

  return {
    demoMode,
    demoStep,
    onTryDemo,
    resetDemo,
    onDemoStepNext,
    demoStepsArray,
  };
}

export default useDemo;
