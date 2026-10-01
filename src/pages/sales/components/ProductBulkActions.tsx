// src/pages/sales/components/ProductBulkActions.tsx
import React from 'react';
import { X, Pencil, Trash2, Printer } from 'lucide-react';
import { useNavbarStore } from '../../../stores/useNavbarStore';

interface ProductBulkActionsProps {
  selectedCount: number;
  onClear: () => void;
  onPrint: () => void;
  onBulkEdit: () => void;
  onBulkDelete: () => void;
  isHidden?: boolean;
}

export const ProductBulkActions: React.FC<ProductBulkActionsProps> = ({
  selectedCount,
  onClear,
  onPrint,
  onBulkEdit,
  onBulkDelete,
  isHidden = false,
}) => {
  const isNavFloatingOpen =
    Boolean(useNavbarStore((s) => s.activeFloating)) || isHidden;

  return (
    <div
      style={{ position: 'fixed' }}
      className={`fixed bottom-[calc(4.5rem+env(safe-area-inset-bottom,0px))] left-3 right-3 md:left-1/2 md:right-auto md:-translate-x-1/2 md:bottom-[6.5rem] lg:bottom-6 z-[195] bg-(--bg-card)/98 backdrop-blur-xl text-(--color-text) px-3.5 py-2.5 sm:px-5 sm:py-3 rounded-2xl shadow-2xl border border-(--border-color) flex items-center justify-between gap-2 sm:gap-4 md:w-auto select-none transition-all duration-300 ease-in-out ${
        isNavFloatingOpen
          ? 'translate-y-24 opacity-0 pointer-events-none'
          : 'translate-y-0 opacity-100 pointer-events-auto'
      }`}
    >
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
