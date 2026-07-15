// src/pages/sales/components/ProductBulkActions.tsx
import React from 'react';
import { X, Pencil, Trash2, Printer } from 'lucide-react';

interface ProductBulkActionsProps {
  selectedCount: number;
  onClear: () => void;
  onPrint: () => void;
  onBulkEdit: () => void;
  onBulkDelete: () => void;
}

export const ProductBulkActions: React.FC<ProductBulkActionsProps> = ({
  selectedCount,
  onClear,
  onPrint,
  onBulkEdit,
  onBulkDelete,
}) => {
  return (
    <>
      <style>{`
        @keyframes slideUpCenter {
          from {
            opacity: 0;
            transform: translate(-50%, 8px);
          }
          to {
            opacity: 1;
            transform: translate(-50%, 0);
          }
        }
        .animate-slide-up-center {
          animation: slideUpCenter 0.25s cubic-bezier(0.16, 1, 0.3, 1) forwards;
        }
      `}</style>

      {/* 
        Adjusted bottom-offsets to bottom-[88px] on mobile and sm:bottom-[96px] on tablet 
        to sit cleanly and strictly above the bottom navigation bar.
      */}
      <div className={`fixed bottom-[88px] sm:bottom-[96px] xl:bottom-10 left-1/2 z-[200] items-center gap-2 px-4 py-2.5 bg-(--bg-card)/95 backdrop-blur-md border border-(--border-color) rounded-full shadow-2xl animate-slide-up-center shrink-0 text-xs select-none ${
        selectedCount === 1 ? 'hidden md:flex' : 'flex'
      }`}>
        
        {/* Selected Indicator & Cancel / Clear Controls */}
        <div className="flex items-center gap-1.5 pr-2.5 border-r border-(--border-color) mr-1 select-none">
          <button
            onClick={onClear}
            className="p-1 rounded-full text-slate-400 hover:text-slate-655 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-zinc-800 transition-colors cursor-pointer"
            title="Clear Selection"
          >
            <X className="w-3.5 h-3.5" />
          </button>
          <span className="font-mono font-black text-xs text-blue-600 dark:text-blue-400">
            {selectedCount}
          </span>
          <span className="text-[9px] font-heading font-black tracking-widest text-slate-450 uppercase hidden sm:inline">
            Selected
          </span>
        </div>

        {/* Action Controls List matching Settings Pill Buttons styling */}
        <div className="flex items-center gap-2">
          <button
            onClick={onPrint}
            className="inline-flex items-center gap-1.5 px-3.5 py-2.5 bg-slate-100 hover:bg-slate-200 dark:bg-neutral-800 dark:hover:bg-neutral-700 text-slate-800 dark:text-slate-200 text-[10px] font-heading tracking-widest uppercase rounded-full shadow-xs transition-all duration-200 hover:scale-105 active:scale-95 cursor-pointer border border-slate-200 dark:border-white/5 font-extrabold"
          >
            <Printer className="w-3.5 h-3.5 text-blue-500" />
            <span>Print<span className="hidden sm:inline"> Labels</span></span>
          </button>

          <button
            onClick={onBulkEdit}
            className="inline-flex items-center gap-1.5 px-3.5 py-2.5 bg-slate-100 hover:bg-slate-200 dark:bg-neutral-800 dark:hover:bg-neutral-700 text-slate-800 dark:text-slate-200 text-[10px] font-heading tracking-widest uppercase rounded-full shadow-xs transition-all duration-200 hover:scale-105 active:scale-95 cursor-pointer border border-slate-200 dark:border-white/5 font-extrabold"
          >
            <Pencil className="w-3.5 h-3.5 text-emerald-500" />
            <span>Edit<span className="hidden sm:inline"> Items</span></span>
          </button>

          <button
            onClick={onBulkDelete}
            className="inline-flex items-center gap-2.5 px-4.5 py-2.5 bg-red-600 hover:bg-red-700 text-white text-[10px] font-heading tracking-widest uppercase rounded-full shadow-md hover:scale-105 active:scale-95 transition-all cursor-pointer border border-red-500/20 font-extrabold"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>Delete<span className="hidden sm:inline"> Selected</span></span>
          </button>
        </div>
      </div>
    </>
  );
};