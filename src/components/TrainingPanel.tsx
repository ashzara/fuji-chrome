"use client";

import { useCallback, useRef, useState } from "react";
import { deriveLUT } from "@/lib/colorMatch";
import { fileToImageData } from "@/lib/imageUtils";

interface Props {
  onLUTReady: (lut: Float32Array) => void;
  hasCustomLUT: boolean;
  onClear: () => void;
}

interface FilePair {
  original: File;
  processed: File;
}

export default function TrainingPanel({ onLUTReady, hasCustomLUT, onClear }: Props) {
  const [open, setOpen] = useState(false);
  const [originals, setOriginals] = useState<File[]>([]);
  const [processed, setProcessed] = useState<File[]>([]);
  const [progress, setProgress] = useState(0);
  const [training, setTraining] = useState(false);
  const [error, setError] = useState("");

  const origRef = useRef<HTMLInputElement>(null);
  const procRef = useRef<HTMLInputElement>(null);

  const pairs: FilePair[] = originals.slice(0, processed.length).map((o, i) => ({
    original: o,
    processed: processed[i],
  }));
  const ready = pairs.length > 0 && !training;

  const handleTrain = useCallback(async () => {
    if (!ready) return;
    setTraining(true);
    setProgress(0);
    setError("");
    try {
      const imagePairs = await Promise.all(
        pairs.map(async (p) => ({
          original: await fileToImageData(p.original),
          processed: await fileToImageData(p.processed),
        }))
      );
      const lut = await deriveLUT(imagePairs, 33, setProgress);
      onLUTReady(lut);
      setOpen(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Training failed.");
    } finally {
      setTraining(false);
    }
  }, [pairs, ready, onLUTReady]);

  return (
    <div className="w-full max-w-3xl mx-auto">
      {/* Toggle bar */}
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 text-sm text-[#666] hover:text-[#999] transition-colors"
      >
        <svg
          width="14" height="14" viewBox="0 0 14 14" fill="none"
          className={`transition-transform ${open ? "rotate-90" : ""}`}
        >
          <path d="M4 2L10 7L4 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        {hasCustomLUT ? (
          <span>
            Custom look active ·{" "}
            <span
              className="text-red-400 hover:text-red-300 cursor-pointer"
              onClick={(e) => { e.stopPropagation(); onClear(); }}
            >
              clear
            </span>
          </span>
        ) : (
          "Train your exact look from example photos"
        )}
      </button>

      {open && (
        <div className="mt-4 rounded-2xl border border-[#2a2a2a] bg-[#111] p-5 flex flex-col gap-5">
          <p className="text-xs text-[#666] leading-relaxed">
            Upload matched pairs — the same scenes, original on the left and your
            Fujifilm-processed version on the right. Files are matched in alphabetical
            order, so make sure they sort the same way (e.g.{" "}
            <code className="text-[#888]">01.jpg, 02.jpg…</code>).
          </p>

          <div className="grid grid-cols-2 gap-4">
            {/* Originals */}
            <DropZone
              label="Original photos"
              files={originals}
              inputRef={origRef}
              onChange={setOriginals}
              disabled={training}
            />
            {/* Processed */}
            <DropZone
              label="Fujifilm-processed"
              files={processed}
              inputRef={procRef}
              onChange={setProcessed}
              disabled={training}
            />
          </div>

          {originals.length > 0 && processed.length > 0 && originals.length !== processed.length && (
            <p className="text-xs text-yellow-500">
              {originals.length} originals vs {processed.length} processed — counts must match.
            </p>
          )}

          {pairs.length > 0 && (
            <p className="text-xs text-[#555]">
              {pairs.length} pair{pairs.length !== 1 ? "s" : ""} ready to train.
            </p>
          )}

          {training && (
            <div className="flex flex-col gap-2">
              <div className="h-1 w-full bg-[#222] rounded-full overflow-hidden">
                <div
                  className="h-full bg-[#c8a882] rounded-full transition-all"
                  style={{ width: `${progress}%` }}
                />
              </div>
              <p className="text-xs text-[#555]">Analysing colour mapping… {Math.round(progress)}%</p>
            </div>
          )}

          {error && <p className="text-xs text-red-400">{error}</p>}

          <button
            onClick={handleTrain}
            disabled={!ready}
            className={[
              "self-start text-sm font-medium px-5 py-2 rounded-lg transition-colors",
              ready
                ? "bg-[#c8a882] hover:bg-[#d4b896] text-black cursor-pointer"
                : "bg-[#222] text-[#444] cursor-not-allowed",
            ].join(" ")}
          >
            {training ? "Training…" : "Apply this look"}
          </button>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Small drop-zone sub-component
// ---------------------------------------------------------------------------

function DropZone({
  label,
  files,
  inputRef,
  onChange,
  disabled,
}: {
  label: string;
  files: File[];
  inputRef: React.RefObject<HTMLInputElement | null>;
  onChange: (files: File[]) => void;
  disabled: boolean;
}) {
  const [drag, setDrag] = useState(false);

  const accept = (fileList: FileList | null) => {
    if (!fileList) return;
    const sorted = Array.from(fileList)
      .filter((f) => f.type.startsWith("image/"))
      .sort((a, b) => a.name.localeCompare(b.name));
    onChange(sorted);
  };

  return (
    <div
      onClick={() => !disabled && inputRef.current?.click()}
      onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
      onDragLeave={() => setDrag(false)}
      onDrop={(e) => { e.preventDefault(); setDrag(false); accept(e.dataTransfer.files); }}
      className={[
        "rounded-xl border border-dashed p-4 cursor-pointer transition-all min-h-[100px] flex flex-col gap-2",
        disabled ? "opacity-40 cursor-not-allowed border-[#222]"
          : drag ? "border-[#c8a882] bg-[#1a1610]"
          : "border-[#2a2a2a] hover:border-[#444]",
      ].join(" ")}
    >
      <p className="text-xs font-medium text-[#888]">{label}</p>
      {files.length === 0 ? (
        <p className="text-xs text-[#444]">Drop images or click</p>
      ) : (
        <ul className="text-xs text-[#666] space-y-0.5">
          {files.slice(0, 4).map((f) => (
            <li key={f.name} className="truncate">{f.name}</li>
          ))}
          {files.length > 4 && (
            <li className="text-[#444]">+{files.length - 4} more</li>
          )}
        </ul>
      )}
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={(e) => accept(e.target.files)}
      />
    </div>
  );
}
