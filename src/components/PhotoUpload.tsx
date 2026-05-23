"use client";

import { useCallback, useRef, useState } from "react";

interface Props {
  onFile: (file: File) => void;
  disabled?: boolean;
}

export default function PhotoUpload({ onFile, disabled }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  const handle = useCallback(
    (file: File | null | undefined) => {
      if (!file || !file.type.startsWith("image/") || disabled) return;
      onFile(file);
    },
    [onFile, disabled]
  );

  return (
    <div
      onClick={() => !disabled && inputRef.current?.click()}
      onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        handle(e.dataTransfer.files[0]);
      }}
      className={[
        "relative flex flex-col items-center justify-center gap-4",
        "w-full max-w-lg mx-auto rounded-2xl border-2 border-dashed",
        "py-16 px-8 transition-all duration-200 select-none",
        disabled
          ? "opacity-40 cursor-not-allowed border-[#2a2a2a]"
          : dragging
          ? "border-[#c8a882] bg-[#1a1610] cursor-copy"
          : "border-[#2a2a2a] hover:border-[#444] hover:bg-[#111] cursor-pointer",
      ].join(" ")}
    >
      {/* Film frame icon */}
      <svg width="48" height="48" viewBox="0 0 48 48" fill="none" className="opacity-50">
        <rect x="4" y="10" width="40" height="28" rx="3" stroke="currentColor" strokeWidth="2" />
        <rect x="4" y="15" width="5" height="4" rx="1" fill="currentColor" />
        <rect x="4" y="22" width="5" height="4" rx="1" fill="currentColor" />
        <rect x="4" y="29" width="5" height="4" rx="1" fill="currentColor" />
        <rect x="39" y="15" width="5" height="4" rx="1" fill="currentColor" />
        <rect x="39" y="22" width="5" height="4" rx="1" fill="currentColor" />
        <rect x="39" y="29" width="5" height="4" rx="1" fill="currentColor" />
        <circle cx="24" cy="24" r="7" stroke="currentColor" strokeWidth="2" />
        <circle cx="24" cy="24" r="2.5" fill="currentColor" />
      </svg>

      <div className="text-center">
        <p className="text-[#e8e8e8] font-medium">Drop a photo here</p>
        <p className="text-[#666] text-sm mt-1">or click to browse · JPG, PNG, WEBP</p>
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => handle(e.target.files?.[0])}
      />
    </div>
  );
}
