"use client";

import { useCallback, useRef, useState } from "react";
import { deriveLUT } from "@/lib/colorMatch";
import { fileToImageData, downloadLUTFile } from "@/lib/imageUtils";

type TrainState = "idle" | "training" | "done" | "error";

export default function AdminPage() {
  const [originals, setOriginals] = useState<File[]>([]);
  const [processed, setProcessed] = useState<File[]>([]);
  const [trainState, setTrainState] = useState<TrainState>("idle");
  const [progress, setProgress] = useState(0);
  const [errorMsg, setErrorMsg] = useState("");
  const [trainedLUT, setTrainedLUT] = useState<Float32Array | null>(null);
  const origRef = useRef<HTMLInputElement>(null);
  const procRef = useRef<HTMLInputElement>(null);

  const sortedByName = (files: File[]) =>
    [...files].sort((a, b) => a.name.localeCompare(b.name));

  const handleOriginals = (list: FileList | null) => {
    if (!list) return;
    setOriginals(sortedByName(Array.from(list).filter((f) => f.type.startsWith("image/"))));
  };
  const handleProcessed = (list: FileList | null) => {
    if (!list) return;
    setProcessed(sortedByName(Array.from(list).filter((f) => f.type.startsWith("image/"))));
  };

  const countMatch = originals.length > 0 && originals.length === processed.length;
  const canTrain = countMatch && trainState !== "training";

  const handleTrain = useCallback(async () => {
    if (!canTrain) return;
    setTrainState("training"); setProgress(0); setErrorMsg(""); setTrainedLUT(null);
    try {
      const pairs = await Promise.all(
        originals.map(async (o, i) => ({
          original: await fileToImageData(o),
          processed: await fileToImageData(processed[i]),
        }))
      );
      const lut = await deriveLUT(pairs, 33, setProgress);
      setTrainedLUT(lut);
      setTrainState("done");
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : "Training failed.");
      setTrainState("error");
    }
  }, [canTrain, originals, processed]);

  return (
    <main className="min-h-screen px-6 py-12 max-w-2xl mx-auto flex flex-col gap-8">
      <div>
        <p className="text-xs text-[#555] uppercase tracking-widest mb-1">Admin · not visible to users</p>
        <h1 className="text-xl font-semibold text-[#e8e8e8]">Train your film look</h1>
        <p className="text-[#666] text-sm mt-2 leading-relaxed">
          Upload matched pairs — originals on the left, your Fujifilm-processed versions on the right.
          Rename them <code className="text-[#888] bg-[#1a1a1a] px-1 rounded">01.jpg, 02.jpg…</code> so they pair up correctly.
          Aim for 5–10 photos covering different lighting situations.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <DropZone label="Original photos" sublabel="Unedited exports" files={originals} inputRef={origRef} onChange={handleOriginals} disabled={trainState === "training"} />
        <DropZone label="Fujifilm-processed" sublabel="Your Classic Chrome edits" files={processed} inputRef={procRef} onChange={handleProcessed} disabled={trainState === "training"} />
      </div>

      {originals.length > 0 && processed.length > 0 && !countMatch && (
        <p className="text-sm text-yellow-500">{originals.length} originals vs {processed.length} processed — counts must match.</p>
      )}
      {countMatch && <p className="text-sm text-[#555]">{originals.length} pair{originals.length !== 1 ? "s" : ""} ready.</p>}

      {trainState === "training" && (
        <div className="flex flex-col gap-2">
          <div className="h-1.5 w-full bg-[#222] rounded-full overflow-hidden">
            <div className="h-full bg-[#c8a882] rounded-full transition-all" style={{ width: `${progress}%` }} />
          </div>
          <p className="text-sm text-[#555]">Analysing colour mapping… {Math.round(progress)}%</p>
        </div>
      )}

      {errorMsg && <p className="text-sm text-red-400">{errorMsg}</p>}

      <button onClick={handleTrain} disabled={!canTrain} className={["w-full py-3 rounded-xl font-medium text-sm transition-colors", canTrain ? "bg-[#c8a882] hover:bg-[#d4b896] text-black cursor-pointer" : "bg-[#1a1a1a] text-[#444] cursor-not-allowed"].join(" ")}>
        {trainState === "training" ? "Training…" : "Derive film look from pairs"}
      </button>

      {trainState === "done" && trainedLUT && (
        <div className="rounded-2xl border border-[#2a2a2a] bg-[#111] p-6 flex flex-col gap-5">
          <div>
            <p className="text-[#e8e8e8] font-medium">Look derived successfully ✓</p>
            <p className="text-[#666] text-sm mt-1">Download the file and add it to your GitHub repo so all users get your look.</p>
          </div>
          <button onClick={() => downloadLUTFile(trainedLUT)} className="self-start flex items-center gap-2 bg-[#c8a882] hover:bg-[#d4b896] text-black font-medium text-sm px-5 py-2.5 rounded-lg transition-colors">
            <svg width="15" height="15" viewBox="0 0 15 15" fill="none">
              <path d="M7.5 10.5L3 6H6V1H9V6H12L7.5 10.5Z" fill="currentColor" />
              <path d="M1 12H14V14H1V12Z" fill="currentColor" />
            </svg>
            Download lut.json
          </button>
          <div className="border-t border-[#222] pt-4 flex flex-col gap-2">
            <p className="text-xs font-medium text-[#888] uppercase tracking-wider">Next steps</p>
            <ol className="text-sm text-[#666] flex flex-col gap-1.5">
              {["Go to your fuji-chrome repo on GitHub", 'Click "Add file" → "Upload files"', 'Open the "public" folder (create it if it doesn\'t exist)', "Upload the lut.json file you just downloaded", 'Click "Commit changes" — Vercel redeploys automatically'].map((s, i) => (
                <li key={i} className="flex gap-2"><span className="text-[#c8a882] font-medium shrink-0">{i + 1}.</span><span>{s}</span></li>
              ))}
            </ol>
          </div>
        </div>
      )}
    </main>
  );
}

function DropZone({ label, sublabel, files, inputRef, onChange, disabled }: {
  label: string; sublabel: string; files: File[];
  inputRef: React.RefObject<HTMLInputElement | null>;
  onChange: (list: FileList | null) => void; disabled: boolean;
}) {
  const [drag, setDrag] = useState(false);
  return (
    <div
      onClick={() => !disabled && inputRef.current?.click()}
      onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
      onDragLeave={() => setDrag(false)}
      onDrop={(e) => { e.preventDefault(); setDrag(false); onChange(e.dataTransfer.files); }}
      className={["rounded-xl border border-dashed p-4 min-h-[120px] flex flex-col gap-1.5 transition-all", disabled ? "opacity-40 cursor-not-allowed border-[#222]" : drag ? "border-[#c8a882] bg-[#1a1610] cursor-copy" : "border-[#2a2a2a] hover:border-[#444] cursor-pointer"].join(" ")}
    >
      <p className="text-xs font-medium text-[#999]">{label}</p>
      <p className="text-xs text-[#444]">{sublabel}</p>
      {files.length === 0 ? <p className="text-xs text-[#333] mt-auto">Drop images or click</p> : (
        <ul className="text-xs text-[#666] space-y-0.5 mt-1">
          {files.slice(0, 5).map((f) => <li key={f.name} className="truncate">{f.name}</li>)}
          {files.length > 5 && <li className="text-[#444]">+{files.length - 5} more</li>}
        </ul>
      )}
      <input ref={inputRef} type="file" accept="image/*" multiple className="hidden" onChange={(e) => onChange(e.target.files)} />
    </div>
  );
}
