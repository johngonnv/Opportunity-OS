import React, { useEffect } from "react";
import { useRouter } from "expo-router";
import { useCaptureSheet } from "@/contexts/CaptureSheetContext";

export default function CaptureIndex() {
  const router = useRouter();
  const { openCapture } = useCaptureSheet();

  useEffect(() => {
    openCapture();
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace("/(tabs)/dashboard");
    }
  }, []);

  return null;
}
