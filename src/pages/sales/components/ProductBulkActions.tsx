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
    <div className="fixed bottom-[calc(5.25rem+env(safe-area-inset-bottom,0px))] md:bottom-8 left-1/2 -translate-x-1/2 z-[210] bg-(--bg-card)/98 backdrop-blur-xl text-(--color-text) px-3 py-2 sm:px-5 sm:py-3 rounded-2xl shadow-2xl border border-(--border-color) flex items-center justify-between gap-2 sm:gap-4 max-w-[calc(100vw-20px)] w-auto animate-slide-up select-none">
      {/* Selected Counter Badge */}
      <div className="flex items-center gap-1.5 pr-2 border-r border-(--border-color) shrink-0">
        <span className="w-6 h-6 rounded-full bg-[#123c73] dark:bg-[#bf0202] text-white font-mono font-bold text-xs flex items-center justify-center shadow-xs">
          {selectedCount}
        </span>
        <span className="font-heading text-[10px] sm:text-xs font-bold uppercase tracking-wider text-(--color-text) hidden xs:inline">
          Selected
        </span>
      </div>

      {/* Action Buttons WITH Visible Names on Mobile */}
      <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
        <button
          type="button"
          onClick={onPrint}
          className="px-2.5 py-1.5 sm:px-3.5 sm:py-2 bg-blue-500/10 hover:bg-blue-500/20 text-blue-600 dark:text-blue-400 rounded-xl text-[10px] font-heading font-bold uppercase tracking-wider cursor-pointer flex items-center gap-1 transition-colors border border-blue-500/20 active:scale-95"
          title="Print Labels"
        >
          <Printer className="w-3.5 h-3.5" />
          <span className="text-[10px] font-bold">Print</span>
        </button>

        <button
          type="button"
          onClick={onBulkEdit}
          className="px-2.5 py-1.5 sm:px-3.5 sm:py-2 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 rounded-xl text-[10px] font-heading font-bold uppercase tracking-wider cursor-pointer flex items-center gap-1 transition-colors border border-emerald-500/20 active:scale-95"
          title="Edit Items"
        >
          <Pencil className="w-3.5 h-3.5" />
          <span className="text-[10px] font-bold">Edit</span>
        </button>

        <button
          type="button"
          onClick={onBulkDelete}
          className="px-2.5 py-1.5 sm:px-3.5 sm:py-2 bg-rose-500/10 hover:bg-rose-500/20 text-rose-600 dark:text-rose-400 rounded-xl text-[10px] font-heading font-bold uppercase tracking-wider cursor-pointer flex items-center gap-1 transition-colors border border-rose-500/20 active:scale-95"
          title="Remove Selected Items"
        >
          <Trash2 className="w-3.5 h-3.5" />
          <span className="text-[10px] font-bold">Remove</span>
        </button>

        <button
          type="button"
          onClick={onClear}
          className="p-1.5 sm:p-2 rounded-xl text-slate-400 hover:text-(--color-text) hover:bg-slate-100 dark:hover:bg-zinc-800 cursor-pointer transition-colors active:scale-95"
          title="Clear selection"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};
