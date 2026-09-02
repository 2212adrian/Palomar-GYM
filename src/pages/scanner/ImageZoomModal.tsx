// src/pages/scanner/ImageZoomModal.tsx
import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { X, ZoomIn, ZoomOut, RotateCcw, Maximize2 } from 'lucide-react';

interface ImageZoomModalProps {
  isOpen: boolean;
  onClose: () => void;
  imageUrl: string;
  title?: string;
}

export const ImageZoomModal: React.FC<ImageZoomModalProps> = ({
  isOpen,
  onClose,
  imageUrl,
  title = 'Photo Verification',
}) => {
  const [scale, setScale] = useState<number>(1);
  const [position, setPosition] = useState<{ x: number; y: number }>({
    x: 0,
    y: 0,
  });
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const dragStartRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

  // Reset zoom & pan when image changes or modal opens
  useEffect(() => {
    if (isOpen) {
      setScale(1);
      setPosition({ x: 0, y: 0 });
    }
  }, [isOpen, imageUrl]);

  // Keyboard accessibility (Escape to close, +/- to zoom)
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      } else if (e.key === '+' || e.key === '=') {
        handleZoomIn();
      } else if (e.key === '-' || e.key === '_') {
        handleZoomOut();
      } else if (e.key === '0') {
        handleReset();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, scale]);

  const handleZoomIn = () => {
    setScale((prev) => Math.min(prev + 0.35, 4));
  };

  const handleZoomOut = () => {
    setScale((prev) => {
      const next = Math.max(prev - 0.35, 0.8);
      if (next <= 1) setPosition({ x: 0, y: 0 });
      return next;
    });
  };

  const handleReset = () => {
    setScale(1);
    setPosition({ x: 0, y: 0 });
  };

  // Mouse wheel zoom
  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    if (e.deltaY < 0) {
      handleZoomIn();
    } else {
      handleZoomOut();
    }
  };

  // Mouse drag panning when zoomed in
  const handleMouseDown = (e: React.MouseEvent) => {
    if (scale <= 1) return;
    setIsDragging(true);
    dragStartRef.current = {
      x: e.clientX - position.x,
      y: e.clientY - position.y,
    };
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging || scale <= 1) return;
    setPosition({
      x: e.clientX - dragStartRef.current.x,
      y: e.clientY - dragStartRef.current.y,
    });
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  if (!isOpen) return null;

  return createPortal(
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.2 }}
        className="fixed inset-0 z-[500] bg-slate-950/90 dark:bg-black/90 backdrop-blur-2xl flex flex-col items-center justify-between p-4 select-none"
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
      >
        {/* TOP BAR */}
        <div className="w-full max-w-2xl flex items-center justify-between px-4 py-3 bg-zinc-900/80 backdrop-blur-md rounded-2xl border border-white/10 shadow-2xl z-10 shrink-0">
          <div className="flex items-center gap-2">
            <Maximize2 className="w-4 h-4 text-blue-400" />
            <h3 className="text-xs sm:text-sm font-bold uppercase tracking-wider text-white truncate">
              {title}
            </h3>
          </div>

          <div className="flex items-center gap-2">
            <span className="font-mono text-xs font-bold text-blue-400 bg-blue-500/10 px-2.5 py-1 rounded-lg border border-blue-500/20">
              {Math.round(scale * 100)}%
            </span>
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-slate-300 hover:text-white transition-all cursor-pointer active:scale-95"
              title="Close (Esc)"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* IMAGE VIEWPORT */}
        <div
          onWheel={handleWheel}
          className="relative flex-1 w-full flex items-center justify-center overflow-hidden my-auto"
        >
          <motion.img
            src={imageUrl}
            alt={title}
            draggable={false}
            onMouseDown={handleMouseDown}
            style={{
              transform: `scale(${scale}) translate(${position.x / scale}px, ${position.y / scale}px)`,
              cursor:
                scale > 1 ? (isDragging ? 'grabbing' : 'grab') : 'zoom-in',
              transition: isDragging ? 'none' : 'transform 0.15s ease-out',
            }}
            onClick={() => {
              if (scale === 1) handleZoomIn();
            }}
            className="max-w-[90vw] max-h-[70vh] object-contain rounded-2xl shadow-2xl border border-white/10 select-none pointer-events-auto"
          />
        </div>

        {/* BOTTOM FLOATING ZOOM TOOLBAR */}
        <div className="flex items-center gap-2 p-2 bg-zinc-900/90 backdrop-blur-md rounded-2xl border border-white/10 shadow-2xl z-10 shrink-0 mb-2">
          <button
            type="button"
            onClick={handleZoomOut}
            disabled={scale <= 0.8}
            className="p-2.5 rounded-xl bg-white/10 hover:bg-white/20 disabled:opacity-30 text-white transition-all cursor-pointer active:scale-95 flex items-center gap-1 text-xs font-bold"
            title="Zoom Out (-)"
          >
            <ZoomOut className="w-4 h-4" />
          </button>

          <button
            type="button"
            onClick={handleReset}
            className="px-3 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-white transition-all cursor-pointer active:scale-95 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider"
            title="Reset Zoom (0)"
          >
            <RotateCcw className="w-3.5 h-3.5 text-amber-400" />
            <span>Reset (1x)</span>
          </button>

          <button
            type="button"
            onClick={handleZoomIn}
            disabled={scale >= 4}
            className="p-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-30 text-white transition-all cursor-pointer active:scale-95 flex items-center gap-1 text-xs font-bold"
            title="Zoom In (+)"
          >
            <ZoomIn className="w-4 h-4" />
          </button>
        </div>
      </motion.div>
    </AnimatePresence>,
    document.body
  );
};
