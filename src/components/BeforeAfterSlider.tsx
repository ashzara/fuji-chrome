"use client";

import { useCallback, useEffect, useRef, useState } from "react";

interface Props {
  beforeUrl: string;
  afterUrl: string;
}

export default function BeforeAfterSlider({ beforeUrl, afterUrl }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState(50); // percentage: 0=all before, 100=all after
  const dragging = useRef(false);

  const updatePos = useCallback((clientX: number) => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const pct = Math.min(100, Math.max(0, ((clientX - rect.left) / rect.width) * 100));
    setPos(pct);
  }, []);

  const onMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    dragging.current = true;
  }, []);

  useEffect(() => {
    const onMove = (e: MouseEvent) => { if (dragging.current) updatePos(e.clientX); };
    const onUp = () => { dragging.current = false; };
    const onTouch = (e: TouchEvent) => { if (dragging.current) updatePos(e.touches[0].clientX); };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    window.addEventListener("touchmove", onTouch);
    window.addEventListener("touchend", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      window.removeEventListener("touchmove", onTouch);
      window.removeEventListener("touchend", onUp);
    };
  }, [updatePos]);

  return (
    <div
      ref={containerRef}
      className="relative w-full rounded-xl overflow-hidden select-none"
      style={{ cursor: "ew-resize" }}
      onMouseDown={(e) => { dragging.current = true; updatePos(e.clientX); }}
      onTouchStart={(e) => { dragging.current = true; updatePos(e.touches[0].clientX); }}
    >
      {/* BEFORE — full width, bottom layer */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={beforeUrl} alt="Before" className="w-full block" draggable={false} />

      {/* AFTER — clipped to show left `pos`% */}
      <div
        className="absolute inset-0 overflow-hidden"
        style={{ clipPath: `inset(0 ${100 - pos}% 0 0)` }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={afterUrl}
          alt="After"
          className="absolute inset-0 w-full h-full object-cover"
          draggable={false}
        />
      </div>

      {/* Divider line */}
      <div
        className="absolute top-0 bottom-0 w-px bg-white/80 pointer-events-none"
        style={{ left: `${pos}%` }}
      />

      {/* Drag handle */}
      <div
        className="slider-handle absolute top-1/2 -translate-y-1/2 -translate-x-1/2 pointer-events-none"
        style={{ left: `${pos}%` }}
        onMouseDown={onMouseDown}
      >
        <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
          <path d="M7 4L3 10L7 16M13 4L17 10L13 16" stroke="#333" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>

      {/* Labels */}
      <span className="absolute bottom-3 left-3 text-xs font-medium text-white/60 bg-black/40 px-2 py-0.5 rounded pointer-events-none">
        BEFORE
      </span>
      <span className="absolute bottom-3 right-3 text-xs font-medium text-white/60 bg-black/40 px-2 py-0.5 rounded pointer-events-none">
        AFTER
      </span>
    </div>
  );
}
