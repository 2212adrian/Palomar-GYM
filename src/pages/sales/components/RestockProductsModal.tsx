// src/pages/sales/components/RestockProductsModal.tsx
import React, { useState, useMemo, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { supabase } from '../../../lib/supabase/client';
import { useAuthStore } from '../../../stores/authStore';
import {
  X,
  Search,
  Boxes,
  Plus,
  Minus,
  RotateCcw,
  CheckCircle2,
  Loader2,
} from 'lucide-react';
import { toast } from 'react-toastify';
import { logAudit } from '../../../lib/supabase/audit';

export interface RestockProductItem {
  id: string;
  barcode_id: string;
  product_name: string;
  image_url: string | null;
  selling_price: number;
  has_stock_limit: boolean;
  stock_quantity: number;
  low_stock_alert: number | null;
  status: 'Active' | 'Inactive';
  manufacturer_barcode?: string | null;
}

interface StagedRestock {
  id: string;
  barcode_id: string;
  product_name: string;
  image_url: string | null;
  has_stock_limit: boolean;
  current_stock: number;
  low_stock_alert: number | null;
  incoming_qty: number;
  supplier_note: string;
  manufacturer_barcode?: string | null;
}

interface RestockProductsModalProps {
  isOpen: boolean;
  onClose: () => void;
  products: RestockProductItem[];
  allCatalogProducts?: RestockProductItem[];
  onOpenStockMovements?: () => void;
  onRestockSuccess: () => void;
}

export const RestockProductsModal: React.FC<RestockProductsModalProps> = ({
  isOpen,
  onClose,
  products,
  allCatalogProducts,
  onOpenStockMovements,
  onRestockSuccess,
}) => {
  const { user, profile } = useAuthStore() as any;

  // 1. Automatically load all limited products without validation options
  const limitedCatalog = useMemo(() => {
    const source =
      allCatalogProducts && allCatalogProducts.length > 0
        ? allCatalogProducts
        : products;
    return source.filter((p) => p.has_stock_limit);
  }, [allCatalogProducts, products]);

  // Full-width search state
  const [searchQuery, setSearchQuery] = useState('');

  // 3. Batch delivery options: 'global' (one global note, hides individual inputs) vs 'individual' (per-item notes)
  const [supplierMode, setSupplierMode] = useState<'global' | 'individual'>('global');
  const [globalSupplierNote, setGlobalSupplierNote] = useState('');
  const [saving, setSaving] = useState(false);

  // Staged incoming stock state automatically populated from all limited products
  const [stagedItems, setStagedItems] = useState<StagedRestock[]>(() => {
    return limitedCatalog.map((p) => ({
      id: p.id,
      barcode_id: p.barcode_id,
      product_name: p.product_name,
      image_url: p.image_url,
      has_stock_limit: true,
      current_stock: p.stock_quantity,
      low_stock_alert: p.low_stock_alert,
      incoming_qty: 0,
      supplier_note: '',
      manufacturer_barcode: p.manufacturer_barcode,
    }));
  });

  // Re-sync when modal opens or catalog changes
  useEffect(() => {
    if (isOpen) {
      setStagedItems(
        limitedCatalog.map((p) => ({
          id: p.id,
          barcode_id: p.barcode_id,
          product_name: p.product_name,
          image_url: p.image_url,
          has_stock_limit: true,
          current_stock: p.stock_quantity,
          low_stock_alert: p.low_stock_alert,
          incoming_qty: 0,
          supplier_note: '',
          manufacturer_barcode: p.manufacturer_barcode,
        }))
      );
      setSearchQuery('');
    }
  }, [isOpen, limitedCatalog]);

  // Handle incoming quantity changes
  const handleUpdateQty = (id: string, qty: number) => {
    const validQty = Math.max(0, Math.floor(qty || 0));
    setStagedItems((prev) =>
      prev.map((item) =>
        item.id === id ? { ...item, incoming_qty: validQty } : item
      )
    );
  };

  const handleAdjustQty = (id: string, delta: number) => {
    setStagedItems((prev) =>
      prev.map((item) => {
        if (item.id !== id) return item;
        const newQty = Math.max(0, item.incoming_qty + delta);
        return { ...item, incoming_qty: newQty };
      })
    );
  };

  const handleUpdateNote = (id: string, note: string) => {
    setStagedItems((prev) =>
      prev.map((item) =>
        item.id === id ? { ...item, supplier_note: note } : item
      )
    );
  };

  // 2. Reset all staged inputs
  const handleResetAll = () => {
    setStagedItems((prev) =>
      prev.map((item) => ({
        ...item,
        incoming_qty: 0,
        supplier_note: '',
      }))
    );
    setGlobalSupplierNote('');
    toast.info('Reset all incoming restock inputs.');
  };

  // Metrics calculations
  const stagedProducts = useMemo(() => {
    return stagedItems.filter((item) => item.incoming_qty > 0);
  }, [stagedItems]);

  const totalIncomingUnits = useMemo(() => {
    return stagedProducts.reduce((sum, item) => sum + item.incoming_qty, 0);
  }, [stagedProducts]);

  // 4. Stretched search filtering based on query
  const displayedItems = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return stagedItems;
    return stagedItems.filter(
      (item) =>
        item.product_name.toLowerCase().includes(q) ||
        item.barcode_id.toLowerCase().includes(q) ||
        (item.manufacturer_barcode &&
          item.manufacturer_barcode.toLowerCase().includes(q))
    );
  }, [stagedItems, searchQuery]);

  // Submission handler
  const handleConfirmRestock = async () => {
    if (stagedProducts.length === 0) {
      toast.warning('No items have incoming restock quantities specified.');
      return;
    }

    try {
      setSaving(true);
      const stockMovementsToInsert: any[] = [];
      const auditSummaries: string[] = [];

      const updatePromises = stagedProducts.map((item) => {
        const newStock = item.current_stock + item.incoming_qty;
        const finalNote =
          supplierMode === 'global'
            ? globalSupplierNote.trim() || null
            : item.supplier_note.trim() || null;

        stockMovementsToInsert.push({
          product_id: item.id,
          product_name: item.product_name,
          movement_type: 'RESTOCK',
          quantity_added: item.incoming_qty,
          previous_stock: item.current_stock,
          new_stock: newStock,
          note: finalNote,
          created_by: user?.id || null,
          created_by_name: profile?.username || user?.email || 'Staff',
          created_at: new Date().toISOString(),
        });

        auditSummaries.push(
          `"${item.product_name}": +${item.incoming_qty} (${item.current_stock} → ${newStock})${
            finalNote ? ` [Note: ${finalNote}]` : ''
          }`
        );

        return supabase
          .from('products')
          .update({
            stock_quantity: newStock,
            updated_at: new Date().toISOString(),
          })
          .eq('id', item.id);
      });

      const results = await Promise.all(updatePromises);
      const hasError = results.some((r) => r.error);
      if (hasError) throw new Error('Failed to update product stock counts');

      // Persist stock movements ledger
      if (stockMovementsToInsert.length > 0) {
        const { error: smErr } = await supabase
          .from('stock_movements')
          .insert(stockMovementsToInsert);

        if (smErr) {
          console.error('Error inserting stock movements:', smErr);
        }
      }

      // Log system audit
      try {
        await logAudit(
          'STOCK_RESTOCK_BULK',
          `Restocked ${stagedProducts.length} items with +${totalIncomingUnits} units: ${auditSummaries.join('; ')}`
        );
      } catch (auditErr) {
        console.warn('Audit logging skipped:', auditErr);
      }

      toast.success(
        `🎉 Successfully restocked ${stagedProducts.length} items (+${totalIncomingUnits} units received)!`
      );
      onRestockSuccess();
      onClose();
    } catch (err: any) {
      console.error('Restock failed:', err);
      toast.error('Failed to complete restock operation. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  if (!isOpen) return null;

  return createPortal(
    <div className="fixed inset-0 z-[16000] bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-0 sm:p-4 text-xs text-(--color-text) animate-fade-in">
      <div className="bg-(--bg-card) border border-(--border-color) rounded-none sm:rounded-3xl w-full max-w-2xl h-full sm:h-[90vh] max-h-[100vh] sm:max-h-[92vh] shadow-2xl flex flex-col overflow-hidden animate-scale-up">
        {/* HEADER */}
        <div className="px-3.5 sm:px-6 py-3 sm:py-4 border-b border-(--border-color) flex items-center justify-between shrink-0 bg-white dark:bg-[#12161f]">
          <div className="flex items-center gap-2.5 sm:gap-3 min-w-0 flex-1">
            <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl sm:rounded-2xl bg-emerald-100 dark:bg-emerald-500/20 text-emerald-700 dark:text-emerald-400 border border-emerald-300 dark:border-emerald-500/30 flex items-center justify-center shadow-xs shrink-0">
              <Boxes className="w-4 h-4 sm:w-5 sm:h-5" />
            </div>
            <div className="min-w-0 flex-1">
              <h2 className="text-xs sm:text-base font-heading font-black tracking-wider uppercase text-slate-900 dark:text-white truncate">
                Restock Products Editor
              </h2>
              <p className="text-[11px] sm:text-xs text-slate-500 dark:text-slate-400 font-medium mt-0.5 hidden xs:block truncate">
                Record incoming shipments & inventory replenishment
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
            {onOpenStockMovements && (
              <button
                type="button"
                onClick={onOpenStockMovements}
                className="w-8 h-8 sm:w-9 sm:h-9 rounded-xl bg-emerald-50 hover:bg-emerald-100 dark:bg-emerald-500/10 dark:hover:bg-emerald-500/20 text-emerald-700 dark:text-emerald-400 border border-emerald-300 dark:border-emerald-500/30 flex items-center justify-center cursor-pointer transition-colors shadow-xs active:scale-95"
                title="View stock movement history"
              >
                <Boxes className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
              </button>
            )}

            <button
              type="button"
              onClick={onClose}
              className="w-8 h-8 sm:w-9 sm:h-9 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-white/10 dark:hover:bg-white/15 text-slate-600 dark:text-slate-300 transition-colors cursor-pointer active:scale-95 border border-slate-200 dark:border-white/10 flex items-center justify-center"
              title="Close Editor"
            >
              <X className="w-4 h-4 sm:w-5 sm:h-5" />
            </button>
          </div>
        </div>

        {/* 3. BATCH DELIVERY / PO NOTE SECTION */}
        <div className="p-3 sm:px-6 bg-slate-50 dark:bg-[#151922] border-b border-(--border-color) shrink-0 space-y-2">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <span className="text-[11px] sm:text-xs font-heading font-extrabold tracking-wider uppercase text-slate-600 dark:text-slate-400">
              Batch Delivery / PO Note
            </span>

            {/* Mode selection: Global Note vs Individual Notes */}
            <div className="flex items-center gap-1 bg-white dark:bg-[#1c2230] p-0.5 rounded-xl border border-slate-200 dark:border-white/10 text-[10px] sm:text-[11px] font-bold">
              <button
                type="button"
                onClick={() => setSupplierMode('global')}
                className={`px-2.5 py-1 rounded-lg transition-all cursor-pointer ${
                  supplierMode === 'global'
                    ? 'bg-emerald-600 text-white shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                Global Note
              </button>
              <button
                type="button"
                onClick={() => setSupplierMode('individual')}
                className={`px-2.5 py-1 rounded-lg transition-all cursor-pointer ${
                  supplierMode === 'individual'
                    ? 'bg-emerald-600 text-white shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                Individual Notes
              </button>
            </div>
          </div>

          {/* When Global mode is active: show the single input box (hiding all individual boxes) */}
          {supplierMode === 'global' ? (
            <input
              type="text"
              placeholder="e.g. PO #1084 - San Miguel Brewery, Delivery Receipt #540"
              value={globalSupplierNote}
              onChange={(e) => setGlobalSupplierNote(e.target.value)}
              className="w-full px-3 py-2 text-xs rounded-xl bg-white dark:bg-[#11141c] border border-slate-300 dark:border-white/10 text-slate-900 dark:text-slate-100 outline-none focus:border-emerald-500 font-medium placeholder:text-slate-400 shadow-xs"
            />
          ) : (
            <p className="text-[10px] sm:text-[11px] text-emerald-600 dark:text-emerald-400 font-semibold italic">
              * Enter notes directly on each product card below.
            </p>
          )}
        </div>

        {/* 4. FULL-WIDTH SEARCH BAR (STRETCHED TO CONTAINER) */}
        <div className="px-3 sm:px-6 pt-3 pb-1.5 shrink-0 bg-(--bg-page)">
          <div className="relative w-full">
            <Search className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              placeholder="Search products by name or barcode..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-8 py-2 sm:py-2.5 rounded-xl bg-white dark:bg-[#141822] border border-slate-300 dark:border-white/10 text-xs sm:text-sm text-slate-900 dark:text-slate-100 outline-none focus:border-emerald-500 font-medium shadow-xs"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer p-1"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* 5. PRODUCT CARDS LIST: Clean, spacious, uncluttered */}
        <div className="flex-1 overflow-y-auto no-scrollbar px-3 sm:px-6 py-2 space-y-2.5 sm:space-y-3 bg-(--bg-page)">
          {displayedItems.length === 0 ? (
            <div className="py-16 text-center text-slate-500 bg-white dark:bg-[#141822] rounded-2xl border border-slate-200 dark:border-white/10">
              <Boxes className="w-10 h-10 text-slate-400 mx-auto mb-2 opacity-50" />
              <p className="font-bold text-sm">No limited products match your search.</p>
            </div>
          ) : (
            displayedItems.map((item) => (
              <div
                key={item.id}
                className={`p-3 sm:p-4 rounded-2xl border transition-all ${
                  item.incoming_qty > 0
                    ? 'bg-emerald-50/70 border-emerald-400 dark:bg-[#17202c] dark:border-emerald-500/40 shadow-xs'
                    : 'bg-white dark:bg-[#141822] border-slate-200 dark:border-slate-800'
                }`}
              >
                {/* Main Card Content: Image, Title/Stock, and Stepper */}
                <div className="flex items-center justify-between gap-2.5 sm:gap-3">
                  {/* Left: Product Thumbnail & Details */}
                  <div className="flex items-center gap-2.5 sm:gap-3 min-w-0 flex-1">
                    <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10 overflow-hidden flex items-center justify-center shrink-0">
                      {item.image_url ? (
                        <img
                          src={item.image_url}
                          alt={item.product_name}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <Boxes className="w-5 h-5 text-slate-400" />
                      )}
                    </div>

                    <div className="min-w-0 flex-1 pr-1">
                      <h4 className="font-bold text-xs sm:text-sm md:text-base truncate text-slate-900 dark:text-white leading-tight">
                        {item.product_name}
                      </h4>
                      <div className="flex items-center gap-1.5 mt-0.5 text-[11px] sm:text-xs text-slate-500 dark:text-slate-400 font-mono whitespace-nowrap overflow-hidden">
                        <span className="shrink-0 font-medium">{item.barcode_id}</span>
                        <span className="shrink-0 opacity-60">•</span>
                        <span className="shrink-0 font-bold text-slate-700 dark:text-slate-300">
                          Stock: {item.current_stock}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Right: Stepper [-] [ 0 ] [+] (Compact on mobile to protect text width) */}
                  <div className="flex items-center gap-0.5 sm:gap-1 bg-slate-100 dark:bg-[#191f2c] p-0.5 sm:p-1 rounded-xl border border-slate-200 dark:border-white/10 shrink-0">
                    <button
                      type="button"
                      onClick={() => handleAdjustQty(item.id, -1)}
                      disabled={item.incoming_qty <= 0}
                      className="w-7 h-7 sm:w-8.5 sm:h-8.5 rounded-lg bg-white dark:bg-[#141822] border border-slate-200 dark:border-white/10 text-slate-700 dark:text-slate-300 flex items-center justify-center disabled:opacity-30 cursor-pointer active:scale-95 transition-all"
                      title="Decrease incoming quantity"
                    >
                      <Minus className="w-3.5 h-3.5" />
                    </button>

                    <input
                      type="number"
                      min="0"
                      value={item.incoming_qty === 0 ? '0' : item.incoming_qty}
                      onChange={(e) =>
                        handleUpdateQty(item.id, parseInt(e.target.value) || 0)
                      }
                      className="w-8 sm:w-11 text-center font-mono font-black text-emerald-600 dark:text-emerald-400 text-sm sm:text-base bg-transparent outline-none p-0"
                    />

                    <button
                      type="button"
                      onClick={() => handleAdjustQty(item.id, 1)}
                      className="w-7 h-7 sm:w-8.5 sm:h-8.5 rounded-lg bg-white dark:bg-[#141822] border border-slate-200 dark:border-white/10 text-slate-700 dark:text-slate-300 flex items-center justify-center cursor-pointer active:scale-95 transition-all"
                      title="Increase incoming quantity"
                    >
                      <Plus className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                {/* 3. Individual Supplier / PO Note (Only visible when supplierMode === 'individual') */}
                {supplierMode === 'individual' && (
                  <div className="mt-2.5 pt-2 border-t border-slate-100 dark:border-white/5 animate-fade-in">
                    <input
                      type="text"
                      placeholder="Supplier / PO delivery memo..."
                      value={item.supplier_note}
                      onChange={(e) => handleUpdateNote(item.id, e.target.value)}
                      className="w-full px-3 py-1.5 sm:py-2 rounded-xl bg-slate-50 dark:bg-[#11141c] border border-slate-200 dark:border-white/10 text-xs text-slate-900 dark:text-slate-100 outline-none focus:border-emerald-500 placeholder:text-slate-400 font-medium"
                    />
                  </div>
                )}
              </div>
            ))
          )}
        </div>

        {/* 2. FOOTER: Consistent height buttons (Reset Input = Icon Button) */}
        <div className="p-3.5 sm:px-6 sm:py-4 border-t border-(--border-color) flex items-center justify-between gap-3 shrink-0 bg-white dark:bg-[#12161f]">
          {/* Reset Inputs as Icon Button (h-12 consistent height) */}
          <button
            type="button"
            onClick={handleResetAll}
            disabled={totalIncomingUnits === 0 && !globalSupplierNote}
            className="h-12 w-12 rounded-2xl border border-slate-300 dark:border-white/10 bg-slate-100 hover:bg-slate-200 dark:bg-white/10 dark:hover:bg-white/15 text-slate-700 dark:text-slate-300 flex items-center justify-center disabled:opacity-30 disabled:pointer-events-none cursor-pointer transition-all active:scale-95 shrink-0"
            title="Reset All Inputs"
            aria-label="Reset All Inputs"
          >
            <RotateCcw className="w-5 h-5" />
          </button>

          {/* Confirm Restock Button with matching h-12 height */}
          <button
            type="button"
            onClick={handleConfirmRestock}
            disabled={saving || totalIncomingUnits === 0}
            className="flex-1 h-12 px-6 rounded-2xl bg-emerald-600 hover:bg-emerald-500 text-white disabled:opacity-35 disabled:pointer-events-none text-xs sm:text-sm font-heading font-black tracking-wider uppercase cursor-pointer transition-all flex items-center justify-center gap-2 shadow-lg shadow-emerald-600/25 active:scale-95"
          >
            {saving ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Recording Restock...</span>
              </>
            ) : (
              <>
                <CheckCircle2 className="w-4 h-4 text-white" />
                <span>Confirm Restock (+{totalIncomingUnits} Units)</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
};
