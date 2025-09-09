import { useState, useRef, useCallback, useEffect } from "react";
import demoImageSrc from "../../assets/demo1.jpg";
import demoImage2Src from "../../assets/demo2.jpg";
export const demoImage = demoImageSrc;
export const demoImage2 = demoImage2Src;

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

interface NudgeFlags {
  showScrubNudge: boolean;
  showFaceBlurNudge: boolean;
  showFaceFilterNudge: boolean;
  showFaceFeatherNudge: boolean;
  showPlateBlurNudge: boolean;
  showPlateFilterNudge: boolean;
  showPlateFeatherNudge: boolean;
  showDownloadNudge: boolean;
}

export interface UseDemoReturn {
  demoMode: boolean;
  demoStep: number;
  nudgeFlags: NudgeFlags;
  onTryDemo: () => void;
  onPreviewImageLoaded: () => void;
  resetDemo: () => void;
  onScrubNudgeNext: () => void;
  onDownloadNudgeDone: () => void;
  hideFaceBlurNudge: () => void;
  hidePlateBlurNudge: () => void;
  onPlateBlurNext: () => void;
  onPlateFilterNext: () => void;
  onPlateFeatherNext: () => void;
  onFaceBlurNext: () => void;
  onFaceFilterNext: () => void;
  onFaceFeatherNext: () => void;
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
  busy,
  canvasVisible,
  resetDetections,
}: DemoParams): UseDemoReturn {
  const [demoMode, setDemoMode] = useState(false);
  const [demoStep, setDemoStep] = useState(0);
  const [showScrubNudge, setShowScrubNudge] = useState(false);
  const [showFaceBlurNudge, setShowFaceBlurNudge] = useState(false);
  const [showFaceFilterNudge, setShowFaceFilterNudge] = useState(false);
  const [showFaceFeatherNudge, setShowFaceFeatherNudge] = useState(false);
  const [showPlateBlurNudge, setShowPlateBlurNudge] = useState(false);
  const [showPlateFilterNudge, setShowPlateFilterNudge] = useState(false);
  const [showPlateFeatherNudge, setShowPlateFeatherNudge] = useState(false);
  const [showDownloadNudge, setShowDownloadNudge] = useState(false);
  const [plateDemoImageLoaded, setPlateDemoImageLoaded] = useState(false);

  const demoPendingRef = useRef(false);

  const resetDemo = useCallback(() => {
    setDemoMode(false);
    setDemoStep(0);
    setShowScrubNudge(false);
    setShowFaceBlurNudge(false);
    setShowFaceFilterNudge(false);
    setShowFaceFeatherNudge(false);
    setShowPlateBlurNudge(false);
    setShowPlateFilterNudge(false);
    setShowPlateFeatherNudge(false);
    setShowDownloadNudge(false);
    setPlateDemoImageLoaded(false);
  }, []);

  const onTryDemo = useCallback(() => {
    setDemoMode(true);
    setDemoStep(0);
    resetDetections();
    setCanvasVisible(false);
    clearCanvas();
    setFacesOn(true);
    setPlatesOn(true);
    setShowScrubNudge(true);
    setShowFaceBlurNudge(false);
    setShowFaceFilterNudge(false);
    setShowFaceFeatherNudge(false);
    setShowPlateBlurNudge(false);
    setShowPlateFilterNudge(false);
    setShowPlateFeatherNudge(false);
    setShowDownloadNudge(false);
    if (previewUrl === demoImage) {
      const img = imgRef.current;
      setPlateDemoImageLoaded(!!(img && img.complete && img.naturalWidth > 0));
      runDetection();
    } else {
      demoPendingRef.current = true;
      setCanvasVisible(false);
      setOrigName("demo.jpg");
      setPreviewUrl(demoImage);
    }
  }, [
    previewUrl,
    resetDetections,
    setCanvasVisible,
    clearCanvas,
    setFacesOn,
    setPlatesOn,
    runDetection,
    setOrigName,
    setPreviewUrl,
    imgRef,
  ]);

  const onPreviewImageLoaded = useCallback(() => {
    if (demoPendingRef.current) {
      demoPendingRef.current = false;
      runDetection();
    }
    if (demoMode) {
      setPlateDemoImageLoaded(true);
    }
  }, [runDetection, demoMode]);

  const onScrubNudgeNext = useCallback(() => {
    setShowScrubNudge(false);
    setShowFaceBlurNudge(true);
  }, []);

  const onDownloadNudgeDone = useCallback(() => {
    resetDemo();
  }, [resetDemo]);

  const onPlateBlurNext = useCallback(() => {
    setShowPlateBlurNudge(false);
    setShowPlateFilterNudge(true);
  }, []);

  const onPlateFilterNext = useCallback(() => {
    setShowPlateFilterNudge(false);
    setShowPlateFeatherNudge(true);
  }, []);

  const onPlateFeatherNext = useCallback(() => {
    setShowPlateFeatherNudge(false);
    setShowFaceBlurNudge(true);
  }, []);

  const onFaceBlurNext = useCallback(() => {
    setShowFaceBlurNudge(false);
    setShowFaceFilterNudge(true);
  }, []);

  const onFaceFilterNext = useCallback(() => {
    setShowFaceFilterNudge(false);
    setShowFaceFeatherNudge(true);
  }, []);

  const onFaceFeatherNext = useCallback(() => {
    setShowFaceFeatherNudge(false);
    setShowDownloadNudge(true);
  }, []);

  const hideFaceBlurNudge = useCallback(() => setShowFaceBlurNudge(false), []);
  const hidePlateBlurNudge = useCallback(
    () => setShowPlateBlurNudge(false),
    []
  );

  useEffect(() => {
    if (busy) {
      setShowFaceBlurNudge(false);
      setShowScrubNudge(false);
    }
  }, [busy]);

  useEffect(() => {
    if (!demoMode) return;
    if (plateDemoImageLoaded && !busy) {
      setShowScrubNudge(false);
      setShowFaceBlurNudge(false);
      setShowFaceFilterNudge(false);
      setShowFaceFeatherNudge(false);
      setShowPlateFilterNudge(false);
      setShowPlateFeatherNudge(false);
      setShowDownloadNudge(false);
      setShowPlateBlurNudge(true);
    }
  }, [demoMode, plateDemoImageLoaded, busy]);

  useEffect(() => {
    if (!demoMode) return;
    if (!busy && canvasVisible && previewUrl === demoImage) {
      setDemoStep(1);
    }
    if (!busy && canvasVisible && previewUrl === demoImage2) {
      setDemoStep(2);
    }
  }, [busy, canvasVisible, previewUrl, demoMode]);

  return {
    demoMode,
    demoStep,
    nudgeFlags: {
      showScrubNudge,
      showFaceBlurNudge,
      showFaceFilterNudge,
      showFaceFeatherNudge,
      showPlateBlurNudge,
      showPlateFilterNudge,
      showPlateFeatherNudge,
      showDownloadNudge,
    },
    onTryDemo,
    onPreviewImageLoaded,
    resetDemo,
    onScrubNudgeNext,
    onDownloadNudgeDone,
    hideFaceBlurNudge,
    hidePlateBlurNudge,
    onPlateBlurNext,
    onPlateFilterNext,
    onPlateFeatherNext,
    onFaceBlurNext,
    onFaceFilterNext,
    onFaceFeatherNext,
  };
}

export default useDemo;
