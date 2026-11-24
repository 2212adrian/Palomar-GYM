// src/components/common/DisplayScaleToggle.tsx
import React, { useRef, useState, useCallback, useEffect } from 'react';
import { RotateCcw } from 'lucide-react';
import {
  useDisplayScale,
  MIN_DISPLAY_SCALE,
  MAX_DISPLAY_SCALE,
  DEFAULT_DISPLAY_SCALE,
  DISPLAY_SCALE_STEP,
  DISPLAY_SCALE_STEPS,
  snapDisplayScale,
  getDisplayScaleLabel,
} from '../../hooks/useDisplayScale';

/**
 * Desktop-only draggable circular-ball slider with clickable 5% snap notches.
 * Defers root page scaling until pointer release or notch click to stay 100% lag-free.
 */
export const DisplayScaleSelector: React.FC<{ className?: string }> = ({
  className = '',
}) => {
  const { displayScale, setDisplayScale, resetDisplayScale } =
    useDisplayScale();
  const trackRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [previewScale, setPreviewScale] = useState<number>(displayScale);
  const latestPreviewRef = useRef<number>(displayScale);

  useEffect(() => {
    if (!isDragging) {
      setPreviewScale(displayScale);
      latestPreviewRef.current = displayScale;
    }
  }, [displayScale, isDragging]);

  const activeScale = isDragging ? previewScale : displayScale;
  const percentProgress =
    ((activeScale - MIN_DISPLAY_SCALE) /
      (MAX_DISPLAY_SCALE - MIN_DISPLAY_SCALE)) *
    100;

  const getSnappedFromClientX = useCallback((clientX: number): number => {
    const track = trackRef.current;
    if (!track) return DEFAULT_DISPLAY_SCALE;
    const rect = track.getBoundingClientRect();
    if (rect.width <= 0) return DEFAULT_DISPLAY_SCALE;
    const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
    const raw = MIN_DISPLAY_SCALE + ratio * (MAX_DISPLAY_SCALE - MIN_DISPLAY_SCALE);
    return snapDisplayScale(raw);
  }, []);

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    const snapped = getSnappedFromClientX(e.clientX);
    setIsDragging(true);
    setPreviewScale(snapped);
    latestPreviewRef.current = snapped;
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDragging) return;
    const snapped = getSnappedFromClientX(e.clientX);
    if (snapped !== latestPreviewRef.current) {
      latestPreviewRef.current = snapped;
      setPreviewScale(snapped);
    }
  };

  const commitDrag = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDragging) return;
    setIsDragging(false);
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
    const finalScale = latestPreviewRef.current;
    if (finalScale !== displayScale) {
      setDisplayScale(finalScale);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    let next = displayScale;
    if (e.key === 'ArrowRight' || e.key === 'ArrowUp') {
      next = snapDisplayScale(displayScale + DISPLAY_SCALE_STEP);
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') {
      next = snapDisplayScale(displayScale - DISPLAY_SCALE_STEP);
    } else if (e.key === 'Home') {
      next = MIN_DISPLAY_SCALE;
    } else if (e.key === 'End') {
      next = MAX_DISPLAY_SCALE;
    } else {
      return;
    }
    e.preventDefault();
    setDisplayScale(next);
  };

  const isCustom = activeScale !== DEFAULT_DISPLAY_SCALE;

  return (
    <div
      className={`hidden xl:flex items-center gap-3 px-3.5 py-2 rounded-xl bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 shadow-2xs select-none ${className}`}
    >
      <div className="flex flex-col min-w-[225px] gap-1.5">
        <div className="flex items-center justify-between gap-2">
          <span className="text-[11px] font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300">
            Text Size
          </span>
          <div className="flex items-center gap-1.5">
            <span className="text-[11px] font-mono font-bold text-blue-600 dark:text-blue-400 tabular-nums">
              {getDisplayScaleLabel(activeScale)} ({activeScale}%)
            </span>
            {isCustom && (
              <button
                type="button"
                onClick={resetDisplayScale}
                title="Reset text size to Standard (100%)"
                aria-label="Reset text size to 100%"
                className="p-0.5 rounded-md text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors cursor-pointer"
              >
                <RotateCcw className="w-3 h-3" />
              </button>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={() => setDisplayScale(MIN_DISPLAY_SCALE)}
            title="Snap to Small (85%)"
            className="text-[11px] font-bold text-slate-500 dark:text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 cursor-pointer leading-none shrink-0"
          >
            A
          </button>

          <div
            ref={trackRef}
            role="slider"
            tabIndex={0}
            aria-label="Desktop Text Size (5% steps)"
            aria-valuemin={MIN_DISPLAY_SCALE}
            aria-valuemax={MAX_DISPLAY_SCALE}
            aria-valuenow={activeScale}
            aria-valuetext={`${getDisplayScaleLabel(activeScale)} (${activeScale}%)`}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={commitDrag}
            onPointerCancel={commitDrag}
            onKeyDown={handleKeyDown}
            className="relative flex-1 h-7 flex items-center cursor-pointer touch-none outline-none group"
          >
            {/* Track background */}
            <div className="w-full h-2 rounded-full bg-slate-200 dark:bg-zinc-800 overflow-hidden relative">
              <div
                className="h-full bg-blue-600 rounded-full transition-[width] duration-100 ease-out"
                style={{ width: `${percentProgress}%` }}
              />
            </div>

            {/* 5% Snap Tick Buttons */}
            {DISPLAY_SCALE_STEPS.map((step) => {
              const stepPct =
                ((step - MIN_DISPLAY_SCALE) /
                  (MAX_DISPLAY_SCALE - MIN_DISPLAY_SCALE)) *
                100;
              const isPassed = step <= activeScale;
              return (
                <button
                  key={step}
                  type="button"
                  tabIndex={-1}
                  aria-label={`Snap text size to ${step}%`}
                  title={`Snap to ${step}%`}
                  onPointerDown={(e) => {
                    e.stopPropagation();
                  }}
                  onClick={(e) => {
                    e.stopPropagation();
                    setDisplayScale(step);
                  }}
                  className={`absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-2 h-2 rounded-full transition-colors cursor-pointer ${
                    isPassed
                      ? 'bg-blue-200 dark:bg-blue-300/80'
                      : 'bg-slate-400/60 dark:bg-zinc-600 hover:bg-blue-400'
                  }`}
                  style={{ left: `${stepPct}%` }}
                />
              );
            })}

            {/* Draggable circle ball */}
            <div
              className={`absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-5 h-5 rounded-full bg-white border-[2.5px] border-blue-600 shadow-md transition-[left,transform] duration-100 ease-out pointer-events-none ${
                isDragging
                  ? 'scale-125 ring-4 ring-blue-500/30'
                  : 'group-hover:scale-110 group-focus-visible:ring-4 group-focus-visible:ring-blue-500/30'
              }`}
              style={{ left: `${percentProgress}%` }}
            />
          </div>

          <button
            type="button"
            onClick={() => setDisplayScale(MAX_DISPLAY_SCALE)}
            title="Snap to Large (130%)"
            className="text-base font-black text-slate-700 dark:text-slate-200 hover:text-blue-600 dark:hover:text-blue-400 cursor-pointer leading-none shrink-0"
          >
            A
          </button>
        </div>
      </div>
    </div>
  );
};
