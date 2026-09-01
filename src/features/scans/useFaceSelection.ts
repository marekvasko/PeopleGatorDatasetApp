import { useCallback, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import type { FaceOccurrence } from "../../types";

export function useFaceSelection(faces: FaceOccurrence[] | undefined) {
  const [params, setParams] = useSearchParams();
  const selectedCrop = params.get("face");
  const selectedFace =
    faces?.find((face) => face.cropName === selectedCrop) ?? null;

  const clearSelectedFace = useCallback(() => {
    if (!params.has("face")) return;

    const next = new URLSearchParams(params);
    next.delete("face");
    setParams(next, { replace: true });
  }, [params, setParams]);

  const chooseFace = useCallback(
    (face: FaceOccurrence) => {
      const next = new URLSearchParams(params);
      next.set("face", face.cropName);
      setParams(next, { replace: true });
    },
    [params, setParams],
  );

  useEffect(() => {
    if (!selectedCrop) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") clearSelectedFace();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [clearSelectedFace, selectedCrop]);

  return { selectedFace, chooseFace, clearSelectedFace };
}

