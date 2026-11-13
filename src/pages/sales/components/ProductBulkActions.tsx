// src/pages/sales/components/ProductBulkActions.tsx
import React, { useState } from 'react';
import {
  X,
  Pencil,
  Trash2,
  Printer,
  Boxes,
  CheckSquare,
  ScanBarcode,
} from 'lucide-react';
import { useNavbarStore } from '../../../stores/useNavbarStore';

interface ProductBulkActionsProps {
  selectedCount: number;
  onClear: () => void;
  onPrint: () => void;
  onBulkEdit: () => void;
  onRestock?: () => void;
  onBulkDelete: () => void;
  isHidden?: boolean;
  barcodeSlot?: React.ReactNode;
  isMultiSelect?: boolean;
  onToggleMultiSelect?: () => void;
  defaultShowBarcode?: boolean;
}

export const ProductBulkActions: React.FC<ProductBulkActionsProps> = ({
  selectedCount,
  onClear,
  onPrint,
  onBulkEdit,
  onRestock,
  onBulkDelete,
  isHidden = false,
  barcodeSlot,
  isMultiSelect = false,
  onToggleMultiSelect,
  defaultShowBarcode = true,
}) => {
  const [showBarcode, setShowBarcode] = useState(defaultShowBarcode);

  const isNavFloatingOpen =
    Boolean(useNavbarStore((s) => s.activeFloating)) || isHidden;

  if (selectedCount < 1) {
    return null;
  }

  return (
    <div
      style={{ position: 'fixed' }}
      className={`fixed bottom-[calc(5.75rem+env(safe-area-inset-bottom,0px))] md:bottom-[6.75rem] lg:bottom-6 left-1/2 -translate-x-1/2 z-[210] flex flex-col items-center gap-2 select-none transition-all duration-300 ease-in-out w-[calc(100vw-1rem)] sm:w-max sm:max-w-[calc(100vw-2rem)] pointer-events-auto ${
        isNavFloatingOpen
          ? 'translate-y-24 opacity-0 pointer-events-none'
          : 'translate-y-0 opacity-100'
      }`}
    >
      {/* Barcode & Image Card (Elevated above dock) */}
      {barcodeSlot && showBarcode && (
        <div className="relative w-full max-w-sm sm:max-w-md animate-slide-up shadow-2xl rounded-2xl overflow-hidden">
          {barcodeSlot}

          {/* Quick close button in top-right of the card */}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setShowBarcode(false);
            }}
            className="absolute top-2 right-2 p-1.5 rounded-full bg-slate-900/70 hover:bg-slate-900 text-white transition-colors cursor-pointer shadow-md active:scale-95 z-20"
            title="Dismiss preview"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Floating Action Buttons Dock */}
      <div className="w-full sm:w-auto bg-(--bg-card)/98 dark:bg-[#161920]/98 backdrop-blur-xl text-(--color-text) px-2 py-1.5 sm:px-4 sm:py-2.5 rounded-2xl shadow-2xl border border-(--border-color) flex items-center justify-between gap-1.5 sm:gap-3">
        {/* Selected Counter Badge + Multi-Select Toggle (Desktop/Tablet) */}
        <div className="flex items-center gap-1.5 sm:gap-2 pr-1.5 sm:pr-2.5 border-r border-(--border-color) shrink-0">
          <span className="w-6 h-6 rounded-full bg-blue-600 text-white font-mono font-bold text-xs flex items-center justify-center shadow-xs shrink-0">
            {selectedCount}
          </span>
          <span className="font-heading text-xs font-bold uppercase tracking-wider text-(--color-text) hidden sm:inline">
            Selected
          </span>

          {onToggleMultiSelect && (
            <button
              type="button"
              onClick={onToggleMultiSelect}
              className={`hidden sm:flex px-2.5 py-1.5 rounded-xl text-[10px] font-heading font-bold uppercase tracking-wider cursor-pointer items-center gap-1.5 transition-all border active:scale-95 ${
                isMultiSelect
                  ? 'bg-blue-600 text-white border-blue-600 shadow-md ring-2 ring-blue-400/30'
                  : 'bg-slate-100 hover:bg-slate-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-slate-700 dark:text-slate-300 border-(--border-color)'
              }`}
              title={
                isMultiSelect
                  ? 'Multi-select is active (click to switch to single-select)'
                  : 'Enable multi-select mode'
              }
            >
              <CheckSquare className="w-3.5 h-3.5 shrink-0" />
              <span>Multi-Select</span>
              <span
                className={`text-[9px] px-1 py-0.2 rounded font-extrabold uppercase ${
                  isMultiSelect
                    ? 'bg-white/20 text-white'
                    : 'bg-slate-200 dark:bg-zinc-700 text-slate-500 dark:text-slate-400'
                }`}
              >
                {isMultiSelect ? 'ON' : 'OFF'}
              </span>
            </button>
          )}
        </div>

        {/* Action Buttons (Full-width equal tiles with labels on mobile, inline pills on sm+) */}
        <div className="flex-1 sm:flex-initial flex items-center gap-1 sm:gap-2 min-w-0">
          {barcodeSlot && (
            <button
              type="button"
              onClick={() => setShowBarcode((prev) => !prev)}
              className={`flex-1 sm:flex-initial min-w-0 py-1.5 px-1 sm:px-3 sm:py-2 rounded-xl font-heading font-bold uppercase tracking-tight sm:tracking-wider cursor-pointer flex flex-col sm:flex-row items-center justify-center gap-0.5 sm:gap-1.5 transition-all border active:scale-95 ${
                showBarcode
                  ? 'bg-blue-600/15 text-blue-600 dark:text-blue-400 border-blue-500/30 ring-1 ring-blue-400/20'
                  : 'bg-slate-100 hover:bg-slate-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-slate-500 dark:text-slate-400 border-(--border-color)'
              }`}
              title={showBarcode ? 'Hide barcode card' : 'Show barcode card'}
            >
              <ScanBarcode className="w-4 h-4 sm:w-3.5 sm:h-3.5 shrink-0" />
              <span className="text-[9px] sm:text-[10px] leading-none truncate max-w-full">
                Barcode
              </span>
            </button>
          )}

          <button
            type="button"
            onClick={onPrint}
            className="flex-1 sm:flex-initial min-w-0 py-1.5 px-1 sm:px-3.5 sm:py-2 bg-blue-500/10 hover:bg-blue-500/20 text-blue-600 dark:text-blue-400 rounded-xl font-heading font-bold uppercase tracking-tight sm:tracking-wider cursor-pointer flex flex-col sm:flex-row items-center justify-center gap-0.5 sm:gap-1.5 transition-colors border border-blue-500/20 active:scale-95"
            title="Print Labels"
          >
            <Printer className="w-4 h-4 sm:w-3.5 sm:h-3.5 shrink-0" />
            <span className="text-[9px] sm:text-[10px] leading-none truncate max-w-full">
              Print
            </span>
          </button>

          {onRestock && (
            <button
              type="button"
              onClick={onRestock}
              className="flex-1 sm:flex-initial min-w-0 py-1.5 px-1 sm:px-3.5 sm:py-2 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 rounded-xl font-heading font-bold uppercase tracking-tight sm:tracking-wider cursor-pointer flex flex-col sm:flex-row items-center justify-center gap-0.5 sm:gap-1.5 transition-colors border border-emerald-500/20 active:scale-95"
              title="Restock Selected Limited Products"
            >
              <Boxes className="w-4 h-4 sm:w-3.5 sm:h-3.5 shrink-0" />
              <span className="text-[9px] sm:text-[10px] leading-none truncate max-w-full">
                Restock
              </span>
            </button>
          )}

          <button
            type="button"
            onClick={onBulkEdit}
            className="flex-1 sm:flex-initial min-w-0 py-1.5 px-1 sm:px-3.5 sm:py-2 bg-slate-100 hover:bg-slate-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-slate-700 dark:text-slate-200 rounded-xl font-heading font-bold uppercase tracking-tight sm:tracking-wider cursor-pointer flex flex-col sm:flex-row items-center justify-center gap-0.5 sm:gap-1.5 transition-colors border border-(--border-color) active:scale-95"
            title="Edit Items"
          >
            <Pencil className="w-4 h-4 sm:w-3.5 sm:h-3.5 shrink-0" />
            <span className="text-[9px] sm:text-[10px] leading-none truncate max-w-full">
              Edit
            </span>
          </button>

          <button
            type="button"
            onClick={onBulkDelete}
            className="flex-1 sm:flex-initial min-w-0 py-1.5 px-1 sm:px-3.5 sm:py-2 bg-rose-500/10 hover:bg-rose-500/20 text-rose-600 dark:text-rose-400 rounded-xl font-heading font-bold uppercase tracking-tight sm:tracking-wider cursor-pointer flex flex-col sm:flex-row items-center justify-center gap-0.5 sm:gap-1.5 transition-colors border border-rose-500/20 active:scale-95"
            title="Remove Selected Items"
          >
            <Trash2 className="w-4 h-4 sm:w-3.5 sm:h-3.5 shrink-0" />
            <span className="text-[9px] sm:text-[10px] leading-none truncate max-w-full">
              Remove
            </span>
          </button>
        </div>

        {/* Clear Selection Button */}
        <div className="flex items-center pl-1 border-l border-(--border-color) sm:border-l-0 sm:pl-0 shrink-0">
          <button
            type="button"
            onClick={onClear}
            className="w-8 h-9 sm:w-auto sm:h-auto sm:p-2 rounded-xl text-slate-400 hover:text-(--color-text) hover:bg-slate-100 dark:hover:bg-zinc-800 cursor-pointer flex items-center justify-center transition-colors active:scale-95 shrink-0"
            title="Clear selection"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
};