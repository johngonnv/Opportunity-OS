import React, { createContext, useCallback, useContext, useState } from "react";
import CaptureBottomSheet from "@/components/CaptureBottomSheet";

interface CaptureSheetContextValue {
  openCapture: () => void;
}

const CaptureSheetContext = createContext<CaptureSheetContextValue | null>(null);

export function CaptureSheetProvider({ children }: { children: React.ReactNode }) {
  const [visible, setVisible] = useState(false);
  const openCapture = useCallback(() => setVisible(true), []);
  const closeCapture = useCallback(() => setVisible(false), []);

  return (
    <CaptureSheetContext.Provider value={{ openCapture }}>
      <CaptureBottomSheet visible={visible} onClose={closeCapture} />
      {children}
    </CaptureSheetContext.Provider>
  );
}

export function useCaptureSheet(): CaptureSheetContextValue {
  const ctx = useContext(CaptureSheetContext);
  if (!ctx) {
    throw new Error("useCaptureSheet must be used within CaptureSheetProvider");
  }
  return ctx;
}
