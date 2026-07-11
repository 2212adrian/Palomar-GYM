//src/pages/sales/components/ProductBulkActions.tsx
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
    /* 
      - Fixed top-0 on mobile to rest cleanly directly over the Topbar
      - Standard sticky positioning on desktop 
      - High z-index (9999) to cover any layout layouts
    */
    <div className={`fixed top-0 left-0 right-0 z-[9999] md:sticky md:top-1 md:z-40 bg-(--bg-card)/95 backdrop-blur-md border-b md:border border-(--border-color) p-3 shadow-md flex items-center justify-between gap-2.5 text-xs font-semibold animate-scale-up ${
      selectedCount === 1 ? 'hidden md:flex' : 'flex'
    }`}>
      <div className="flex items-center gap-1.5 shrink-0 leading-none">
        <span className="text-[14px] font-extrabold text-blue-600 dark:text-blue-400 font-mono">
          {selectedCount}
        </span>
        <span className="text-[9px] text-slate-400 uppercase tracking-widest font-extrabold">Selected</span>
      </div>
      
      {/* 
        Responsive button container:
        Hides full text on extra small viewports (e.g. iPhone SE) using Tailwind breakpoints
        to avoid horizontal wrapping and keep it cleanly inside a single row
      */}
      <div className="flex gap-1 sm:gap-1.5 items-center">
        <button
          onClick={onPrint}
          className="px-2.5 py-1.5 bg-blue-500/10 text-blue-400 border border-blue-500/20 hover:bg-blue-500/20 rounded-lg text-[9px] sm:text-[10px] cursor-pointer font-bold uppercase transition-colors flex items-center gap-1 shrink-0"
        >
          <Printer className="w-3.5 h-3.5" />
          <span>Print<span className="hidden sm:inline"> Labels</span></span>
        </button>
        <button
          onClick={onBulkEdit}
          className="px-2.5 py-1.5 bg-green-500/10 text-green-600 border border-green-500/20 hover:bg-green-500/20 rounded-lg text-[9px] sm:text-[10px] cursor-pointer font-bold uppercase transition-colors flex items-center gap-1 shrink-0"
        >
          <Pencil className="w-3.5 h-3.5" />
          <span>Edit<span className="hidden sm:inline"> Selected</span></span>
        </button>
        <button
          onClick={onBulkDelete}
          className="px-2.5 py-1.5 bg-red-500/10 text-red-600 border border-red-500/20 hover:bg-red-500/20 rounded-lg text-[9px] sm:text-[10px] cursor-pointer font-bold uppercase transition-colors flex items-center gap-1 shrink-0"
        >
          <Trash2 className="w-3.5 h-3.5" />
          <span>Delete<span className="hidden sm:inline"> Selected</span></span>
        </button>
        <button
          onClick={onClear}
          className="p-1 text-slate-400 hover:text-slate-650 dark:hover:text-slate-200 transition-colors cursor-pointer shrink-0"
          title="Clear selections"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};