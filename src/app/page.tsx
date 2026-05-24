"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import PhotoUpload from "@/components/PhotoUpload";
import BeforeAfterSlider from "@/components/BeforeAfterSlider";
import { fetchDeployedLUT, fileToImageData, imageDataToBlob } from "@/lib/imageUtils";
import { normalizeExposure } from "@/lib/normalize";
import { applyLUT, createClassicChromeLUT, LUT_SIZE } from "@/lib/lut";

interface Result {
  name: string;
  beforeUrl: string;
  afterUrl: string;
  blob: Blob;
}

type State = "idle" | "processing" | "done";

export default function Home() {
  const [state, setState] = useState<State>("idle");
  const [results, setResults] = useState<Result[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [totalCount, setTotalCount] = useState(0);
  const [progress, setProgress] = useState(0);
  const [selected, setSelected] = useState<Result | null>(null);
  const lutRef = useRef<Float32Array | null>(null);

  useEffect(() => {
    fetchDeployedLUT().then((lut) => {
      lutRef.current = lut ?? createClassicChromeLUT(LUT_SIZE);
    });
  }, []);

  const getActiveLUT = () => {
    if (!lutRef.current) lutRef.current = createClassicChromeLUT(LUT_SIZE);
    return lutRef.current;
  };

  const handleFiles = useCallback(async (files: File[]) => {
    setState("processing");
    setCurrentIndex(0);
    setTotalCount(files.length);
    setProgress(0);
    setResults([]);
    setSelected(null);

    const newResults: Result[] = [];

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      setCurrentIndex(i + 1);
      setProgress(0);

      const imageData = await fileToImageData(file);
      const pixels = new Uint8ClampedArray(imageData.data);
      normalizeExposure(pixels);
      const result = await applyLUT(pixels, getActiveLUT(), LUT_SIZE, setProgress);
      const blob = await imageDataToBlob(new ImageData(result, imageData.width, imageData.height));

      newResults.push({
        name: file.name.replace(/\.[^.]+$/, ""),
        beforeUrl: URL.createObjectURL(file),
        afterUrl: URL.createObjectURL(blob),
        blob,
      });

      setResults([...newResults]);
    }

    setState("done");
  }, []);

  const download = (r: Result) => {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(r.blob);
    a.download = `${r.name}_fuji.jpg`;
    a.click();
  };

  const downloadAll = async (list: Result[]) => {
    for (const r of list) {
      download(r);
      await new Promise((res) => setTimeout(res, 400));
    }
  };

  const handleReset = () => {
    results.forEach((r) => { URL.revokeObjectURL(r.beforeUrl); URL.revokeObjectURL(r.afterUrl); });
    setResults([]);
    setSelected(null);
    setState("idle");
  };

  return (
    <main className="min-h-screen flex flex-col items-center px-4 py-12 gap-10">
      <header className="text-center">
        <h1 className="text-2xl font-semibold tracking-wide text-[#e8e8e8]">Fuji Chrome</h1>
        <p className="text-[#666] text-xs mt-1 tracking-widest uppercase">Classic Chrome · Film Look</p>
      </header>

      {/* Upload — always visible unless processing */}
      {state !== "processing" && (
        <div className="w-full max-w-lg">
          <PhotoUpload onFiles={handleFiles} disabled={state === "processing"} />
        </div>
      )}

      {/* Processing indicator */}
      {state === "processing" && (
        <div className="flex flex-col items-center gap-4 w-full max-w-lg mx-auto rounded-2xl border-2 border-dashed border-[#2a2a2a] py-16 px-8">
          <div className="w-8 h-8 border-2 border-[#c8a882] border-t-transparent rounded-full animate-spin" />
          <p className="text-[#999] text-sm">
            Processing photo {currentIndex} of {totalCount}…
          </p>
          <div className="w-48 h-1 bg-[#222] rounded-full overflow-hidden">
            <div
              className="h-full bg-[#c8a882] rounded-full transition-all duration-100"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      )}

      {/* Results grid */}
      {results.length > 0 && (
        <div className="w-full max-w-4xl flex flex-col gap-6">
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {results.map((r) => (
              <div
                key={r.name}
                className="group relative rounded-xl overflow-hidden bg-[#111] border border-[#1e1e1e] cursor-pointer"
                onClick={() => setSelected(r)}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={r.afterUrl} alt={r.name} className="w-full aspect-square object-cover" />
                <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-all flex items-center justify-center">
                  <span className="text-white text-xs opacity-0 group-hover:opacity-100 transition-opacity">
                    Compare ↔
                  </span>
                </div>
                <div className="absolute bottom-0 left-0 right-0 px-2.5 py-2 bg-gradient-to-t from-black/70 to-transparent flex items-center justify-between">
                  <span className="text-white/70 text-xs truncate max-w-[70%]">{r.name}</span>
                  <button
                    onClick={(e) => { e.stopPropagation(); download(r); }}
                    className="text-white/80 hover:text-white transition-colors"
                    title="Download"
                  >
                    <svg width="14" height="14" viewBox="0 0 15 15" fill="none">
                      <path d="M7.5 10.5L3 6H6V1H9V6H12L7.5 10.5Z" fill="currentColor" />
                      <path d="M1 12H14V14H1V12Z" fill="currentColor" />
                    </svg>
                  </button>
                </div>
              </div>
            ))}
          </div>

          {state === "done" && (
            <div className="flex items-center justify-between">
              <button onClick={handleReset} className="text-[#666] text-sm hover:text-[#999] transition-colors">
                ← Process more photos
              </button>
              <button
                onClick={() => downloadAll(results)}
                className="flex items-center gap-2 bg-[#c8a882] hover:bg-[#d4b896] text-black font-medium text-sm px-5 py-2.5 rounded-lg transition-colors"
              >
                <svg width="15" height="15" viewBox="0 0 15 15" fill="none">
                  <path d="M7.5 10.5L3 6H6V1H9V6H12L7.5 10.5Z" fill="currentColor" />
                  <path d="M1 12H14V14H1V12Z" fill="currentColor" />
                </svg>
                Download all ({results.length})
              </button>
            </div>
          )}
        </div>
      )}

      {/* Before/after modal — click a photo to compare */}
      {selected && (
        <div
          className="fixed inset-0 bg-black/90 z-50 flex flex-col items-center justify-center p-4 gap-4"
          onClick={() => setSelected(null)}
        >
          <div className="w-full max-w-2xl" onClick={(e) => e.stopPropagation()}>
            <BeforeAfterSlider beforeUrl={selected.beforeUrl} afterUrl={selected.afterUrl} />
            <div className="flex justify-between mt-4">
              <button onClick={() => setSelected(null)} className="text-[#666] text-sm hover:text-[#999]">
                ✕ Close
              </button>
              <button
                onClick={() => download(selected)}
                className="flex items-center gap-2 bg-[#c8a882] hover:bg-[#d4b896] text-black font-medium text-sm px-5 py-2.5 rounded-lg"
              >
                Download
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
