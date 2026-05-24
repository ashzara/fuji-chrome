"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import BeforeAfterSlider from "@/components/BeforeAfterSlider";
import PhotoUpload from "@/components/PhotoUpload";
import { fetchDeployedLUT, fileToImageData, imageDataToBlob } from "@/lib/imageUtils";
import { normalizeExposure } from "@/lib/normalize";
import { applyLUT, createClassicChromeLUT, LUT_SIZE } from "@/lib/lut";
import { initSegmenter, segmentImage } from "@/lib/segment";
import { applyBokehBlur } from "@/lib/bokeh";
import { applyVignette, applyHalation, applyGrain } from "@/lib/filmEffects";

type ProcessingState = "idle" | "processing" | "done" | "error";

interface PhotoResult {
  id: string;
  name: string;
  beforeUrl: string;
  afterUrl: string;
  afterBlob: Blob;
}

export default function Home() {
  const [appState, setAppState]           = useState<ProcessingState>("idle");
  const [results, setResults]             = useState<PhotoResult[]>([]);
  const [progress, setProgress]           = useState(0);
  const [progressLabel, setProgressLabel] = useState("");
  const [errorMsg, setErrorMsg]           = useState("");
  const [modelReady, setModelReady]       = useState(false);
  const [activeModal, setActiveModal]     = useState<PhotoResult | null>(null);

  const lutRef = useRef<Float32Array | null>(null);

  useEffect(() => {
    fetchDeployedLUT().then((lut) => {
      lutRef.current = lut ?? createClassicChromeLUT(LUT_SIZE);
    });
    initSegmenter().then(() => setModelReady(true));
  }, []);

  const getActiveLUT = (): Float32Array => {
    if (!lutRef.current) lutRef.current = createClassicChromeLUT(LUT_SIZE);
    return lutRef.current;
  };

  const processFile = async (file: File): Promise<PhotoResult> => {
    const beforeUrl = URL.createObjectURL(file);
    const name = file.name.replace(/\.[^.]+$/, "");

    // Step 1: Load
    setProgressLabel("Loading…");
    setProgress(5);
    const imageData = await fileToImageData(file);
    const pixels = new Uint8ClampedArray(imageData.data);

    // Step 2: Segment background
    setProgressLabel("Detecting background…");
    setProgress(12);
    const mask = await segmentImage(imageData);

    // Step 3: Exposure only — colours untouched so warmth is preserved
    setProgressLabel("Balancing exposure…");
    setProgress(20);
    normalizeExposure(pixels);

    // Step 4: Bokeh (GPU Gaussian blur — no pixelation)
    setProgressLabel("Applying bokeh…");
    setProgress(28);
    const bokehPixels = await applyBokehBlur(
      pixels,
      imageData.width,
      imageData.height,
      mask,
      16,                                         // strength 16px — subtle, not aggressive
      (p) => setProgress(28 + p * 0.25)           // 28 → 53
    );

    // Step 5: Film LUT (colour grade)
    setProgressLabel("Applying film look…");
    setProgress(55);
    const lutResult = await applyLUT(
      bokehPixels,
      getActiveLUT(),
      LUT_SIZE,
      (p) => setProgress(55 + p * 0.25)           // 55 → 80
    );

    // Step 6: Film finishing — glow first, then vignette, then grain
    setProgressLabel("Adding film character…");
    setProgress(82);
    const finalPixels = new Uint8ClampedArray(lutResult);
    applyHalation(finalPixels, imageData.width, imageData.height);  // warm glow on highlights
    applyVignette(finalPixels, imageData.width, imageData.height);  // subtle dark corners
    applyGrain(finalPixels, imageData.width, imageData.height);     // film grain

    // Step 7: Encode
    setProgress(97);
    const blob = await imageDataToBlob(
      new ImageData(finalPixels, imageData.width, imageData.height)
    );
    const afterUrl = URL.createObjectURL(blob);
    return { id: crypto.randomUUID(), name, beforeUrl, afterUrl, afterBlob: blob };
  };

  const handleFiles = useCallback(
    async (files: File[]) => {
      if (files.length === 0) return;
      results.forEach((r) => {
        URL.revokeObjectURL(r.beforeUrl);
        URL.revokeObjectURL(r.afterUrl);
      });
      setResults([]);
      setActiveModal(null);
      setAppState("processing");
      setErrorMsg("");
      setProgress(0);

      try {
        const newResults: PhotoResult[] = [];
        for (let i = 0; i < files.length; i++) {
          setProgressLabel(
            files.length > 1 ? `Photo ${i + 1} of ${files.length}…` : "Processing…"
          );
          newResults.push(await processFile(files[i]));
        }
        setResults(newResults);
        setAppState("done");
      } catch (err) {
        setErrorMsg(err instanceof Error ? err.message : "Something went wrong.");
        setAppState("error");
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [results]
  );

  const handleDownloadAll = () => {
    results.forEach((r, i) => {
      setTimeout(() => {
        const a = document.createElement("a");
        a.href = URL.createObjectURL(r.afterBlob);
        a.download = `${r.name}_fuji.jpg`;
        a.click();
      }, i * 400);
    });
  };

  const handleReset = () => {
    results.forEach((r) => {
      URL.revokeObjectURL(r.beforeUrl);
      URL.revokeObjectURL(r.afterUrl);
    });
    setResults([]);
    setActiveModal(null);
    setAppState("idle");
    setErrorMsg("");
    setProgress(0);
  };

  return (
    <main className="min-h-screen flex flex-col items-center px-4 py-12 gap-10">

      <header className="text-center">
        <h1 className="text-2xl font-semibold tracking-wide text-[#e8e8e8]">Fuji Chrome</h1>
        <p className="text-[#666] text-xs mt-1 tracking-widest uppercase">
          Classic Chrome · Film Look
        </p>
        <p className={[
          "text-[10px] mt-2 tracking-wider uppercase transition-colors duration-500",
          modelReady ? "text-[#4a7c5a]" : "text-[#444]",
        ].join(" ")}>
          {modelReady ? "● Model ready" : "○ Loading model…"}
        </p>
      </header>

      {appState === "idle" && (
        <div className="w-full max-w-lg">
          <PhotoUpload onFiles={handleFiles} disabled={false} />
        </div>
      )}

      {appState === "processing" && (
        <div className="flex flex-col items-center justify-center gap-4 w-full max-w-lg mx-auto rounded-2xl border-2 border-dashed border-[#2a2a2a] py-16 px-8">
          <div className="w-8 h-8 border-2 border-[#c8a882] border-t-transparent rounded-full animate-spin" />
          <div className="w-48 h-1 bg-[#222] rounded-full overflow-hidden">
            <div
              className="h-full bg-[#c8a882] rounded-full transition-all duration-150"
              style={{ width: `${progress}%` }}
            />
          </div>
          <p className="text-[#555] text-sm">{progressLabel}</p>
        </div>
      )}

      {appState === "error" && (
        <div className="w-full max-w-lg rounded-xl bg-red-950/40 border border-red-800/40 px-4 py-3 text-sm text-red-300 flex items-center justify-between">
          <span>{errorMsg}</span>
          <button onClick={handleReset} className="ml-4 underline text-red-400 hover:text-red-300 shrink-0">
            Try again
          </button>
        </div>
      )}

      {appState === "done" && results.length > 0 && (
        <div className="w-full max-w-4xl flex flex-col gap-6">
          <div className="flex items-center justify-between">
            <button onClick={handleReset} className="text-[#666] text-sm hover:text-[#999] transition-colors">
              ← Upload more photos
            </button>
            {results.length > 1 && (
              <button
                onClick={handleDownloadAll}
                className="flex items-center gap-2 bg-[#c8a882] hover:bg-[#d4b896] text-black font-medium text-sm px-5 py-2.5 rounded-lg transition-colors"
              >
                <DownloadIcon /> Download all ({results.length})
              </button>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {results.map((r) => (
              <div
                key={r.id}
                className="rounded-2xl overflow-hidden border border-[#2a2a2a] bg-[#111] cursor-pointer hover:border-[#444] transition-colors group"
                onClick={() => setActiveModal(r)}
              >
                <div className="relative aspect-square overflow-hidden">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={r.afterUrl} alt={r.name} className="w-full h-full object-cover" />
                  <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors flex items-center justify-center">
                    <span className="text-white text-xs font-medium opacity-0 group-hover:opacity-100 transition-opacity bg-black/60 px-3 py-1 rounded-full">
                      Compare
                    </span>
                  </div>
                </div>
                <div className="px-3 py-2.5 flex items-center justify-between">
                  <p className="text-xs text-[#666] truncate">{r.name}</p>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      const a = document.createElement("a");
                      a.href = URL.createObjectURL(r.afterBlob);
                      a.download = `${r.name}_fuji.jpg`;
                      a.click();
                    }}
                    className="text-[#c8a882] hover:text-[#d4b896] transition-colors shrink-0 ml-2"
                    title="Download"
                  >
                    <DownloadIcon />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {activeModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-4"
          onClick={() => setActiveModal(null)}
        >
          <div className="relative w-full max-w-3xl" onClick={(e) => e.stopPropagation()}>
            <BeforeAfterSlider beforeUrl={activeModal.beforeUrl} afterUrl={activeModal.afterUrl} />
            <div className="flex items-center justify-between mt-3">
              <button onClick={() => setActiveModal(null)} className="text-[#666] text-sm hover:text-[#999] transition-colors">
                ✕ Close
              </button>
              <button
                onClick={() => {
                  const a = document.createElement("a");
                  a.href = URL.createObjectURL(activeModal.afterBlob);
                  a.download = `${activeModal.name}_fuji.jpg`;
                  a.click();
                }}
                className="flex items-center gap-2 bg-[#c8a882] hover:bg-[#d4b896] text-black font-medium text-sm px-5 py-2.5 rounded-lg transition-colors"
              >
                <DownloadIcon /> Download
              </button>
            </div>
          </div>
        </div>
      )}

      <footer className="mt-auto text-[#333] text-xs text-center">
        All processing happens in your browser · nothing is uploaded
      </footer>
    </main>
  );
}

function DownloadIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 15 15" fill="none">
      <path d="M7.5 10.5L3 6H6V1H9V6H12L7.5 10.5Z" fill="currentColor" />
      <path d="M1 12H14V14H1V12Z" fill="currentColor" />
    </svg>
  );
}
