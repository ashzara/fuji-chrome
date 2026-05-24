"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import BeforeAfterSlider from "@/components/BeforeAfterSlider";
import PhotoUpload from "@/components/PhotoUpload";
import { fetchDeployedLUT, fileToImageData, imageDataToBlob } from "@/lib/imageUtils";
import { normalizeExposure } from "@/lib/normalize";
import { applyLUT, createClassicChromeLUT, LUT_SIZE } from "@/lib/lut";

type State = "idle" | "processing" | "done" | "error";

export default function Home() {
  const [state, setState] = useState<State>("idle");
  const [beforeUrl, setBeforeUrl] = useState<string | null>(null);
  const [afterUrl, setAfterUrl] = useState<string | null>(null);
  const [afterBlob, setAfterBlob] = useState<Blob | null>(null);
  const [originalName, setOriginalName] = useState("photo");
  const [errorMsg, setErrorMsg] = useState("");
  const [progress, setProgress] = useState(0);
  const lutRef = useRef<Float32Array | null>(null);

  useEffect(() => {
    fetchDeployedLUT().then((lut) => {
      lutRef.current = lut ?? createClassicChromeLUT(LUT_SIZE);
    });
  }, []);

  const getActiveLUT = (): Float32Array => {
    if (!lutRef.current) lutRef.current = createClassicChromeLUT(LUT_SIZE);
    return lutRef.current;
  };

  const handleFile = useCallback(async (file: File) => {
    if (beforeUrl) URL.revokeObjectURL(beforeUrl);
    if (afterUrl) URL.revokeObjectURL(afterUrl);
    setBeforeUrl(URL.createObjectURL(file));
    setAfterUrl(null);
    setAfterBlob(null);
    setOriginalName(file.name.replace(/\.[^.]+$/, ""));
    setState("processing");
    setProgress(0);
    setErrorMsg("");
    try {
      const imageData = await fileToImageData(file);
      const pixels = new Uint8ClampedArray(imageData.data);
      normalizeExposure(pixels);
      const result = await applyLUT(pixels, getActiveLUT(), LUT_SIZE, setProgress);
      const blob = await imageDataToBlob(new ImageData(result, imageData.width, imageData.height));
      setAfterUrl(URL.createObjectURL(blob));
      setAfterBlob(blob);
      setState("done");
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Something went wrong.");
      setState("error");
    }
  }, [beforeUrl, afterUrl]);

  const handleDownload = () => {
    if (!afterBlob) return;
    const a = document.createElement("a");
    a.href = URL.createObjectURL(afterBlob);
    a.download = `${originalName}_fuji.jpg`;
    a.click();
  };

  const handleReset = () => {
    if (afterUrl) URL.revokeObjectURL(afterUrl);
    if (beforeUrl) URL.revokeObjectURL(beforeUrl);
    setBeforeUrl(null); setAfterUrl(null); setAfterBlob(null);
    setState("idle"); setErrorMsg(""); setProgress(0);
  };

  return (
    <main className="min-h-screen flex flex-col items-center px-4 py-12 gap-10">
      <header className="text-center">
        <h1 className="text-2xl font-semibold tracking-wide text-[#e8e8e8]">Fuji Chrome</h1>
        <p className="text-[#666] text-xs mt-1 tracking-widest uppercase">Classic Chrome · Film Look</p>
      </header>

      <div className="w-full max-w-lg">
        {state === "processing" ? (
          <div className="flex flex-col items-center justify-center gap-4 w-full max-w-lg mx-auto rounded-2xl border-2 border-dashed border-[#2a2a2a] py-16 px-8">
            <div className="w-8 h-8 border-2 border-[#c8a882] border-t-transparent rounded-full animate-spin" />
            <div className="w-40 h-1 bg-[#222] rounded-full overflow-hidden">
              <div className="h-full bg-[#c8a882] rounded-full transition-all duration-100" style={{ width: `${progress}%` }} />
            </div>
            <p className="text-[#555] text-sm">Applying film look…</p>
          </div>
        ) : (
          <PhotoUpload onFile={handleFile} disabled={state === "processing"} />
        )}
      </div>

      {state === "error" && (
        <div className="w-full max-w-lg rounded-xl bg-red-950/40 border border-red-800/40 px-4 py-3 text-sm text-red-300">{errorMsg}</div>
      )}

      {state === "done" && beforeUrl && afterUrl && (
        <div className="w-full max-w-3xl flex flex-col gap-5">
          <BeforeAfterSlider beforeUrl={beforeUrl} afterUrl={afterUrl} />
          <div className="flex items-center justify-between">
            <button onClick={handleReset} className="text-[#666] text-sm hover:text-[#999] transition-colors">← Try another photo</button>
            <button onClick={handleDownload} className="flex items-center gap-2 bg-[#c8a882] hover:bg-[#d4b896] text-black font-medium text-sm px-5 py-2.5 rounded-lg transition-colors">
              <svg width="15" height="15" viewBox="0 0 15 15" fill="none">
                <path d="M7.5 10.5L3 6H6V1H9V6H12L7.5 10.5Z" fill="currentColor" />
                <path d="M1 12H14V14H1V12Z" fill="currentColor" />
              </svg>
              Download
            </button>
          </div>
        </div>
      )}
      <footer className="mt-auto text-[#333] text-xs text-center">All processing happens in your browser · nothing is uploaded</footer>
    </main>
  );
}
