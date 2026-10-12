// src/pages/sales/components/StockMovementHistoryModal.tsx
import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { supabase } from '../../../lib/supabase/client';
import {
  X,
  Search,
  Package,
  Calendar,
  User,
  FileText,
  TrendingUp,
  Loader2,
  RefreshCw,
  Boxes,
} from 'lucide-react';
import { format } from 'date-fns';

export interface StockMovementRecord {
  id: string;
  product_id: string;
  product_name: string;
  movement_type: string;
  quantity_added: number;
  previous_stock: number;
  new_stock: number;
  note: string | null;
  created_by: string | null;
  created_by_name: string | null;
  created_at: string;
}

interface StockMovementHistoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  productId?: string;
  productName?: string;
  onOpenRestockModal?: () => void;
}

export const StockMovementHistoryModal: React.FC<
  StockMovementHistoryModalProps
> = ({ isOpen, onClose, productId, productName, onOpenRestockModal }) => {
  const [movements, setMovements] = useState<StockMovementRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');

  const fetchMovements = async () => {
    try {
      setLoading(true);
      let query = supabase
        .from('stock_movements')
        .select('*')
        .order('created_at', { ascending: false });

      if (productId) {
        query = query.eq('product_id', productId);
      }

      const { data, error } = await query;
      if (error) throw error;
      setMovements(data || []);
    } catch (err) {
      console.warn('Failed to fetch stock movements:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!isOpen) return;
    fetchMovements();

    const channel = supabase
      .channel('stock_movements_realtime')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'stock_movements' },
        (payload) => {
          const newRecord = payload.new as StockMovementRecord;
          if (!productId || newRecord.product_id === productId) {
            setMovements((prev) => [newRecord, ...prev]);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [isOpen, productId]);

  const filteredMovements = movements.filter((m) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      m.product_name.toLowerCase().includes(q) ||
      (m.note && m.note.toLowerCase().includes(q)) ||
      (m.created_by_name && m.created_by_name.toLowerCase().includes(q))
    );
  });

  if (!isOpen) return null;

  return createPortal(
    <div className="fixed inset-0 z-[16000] bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-0 sm:p-4 animate-fade-in text-xs text-(--color-text)">
      <div className="bg-(--bg-card) border border-(--border-color) rounded-none sm:rounded-3xl w-full max-w-4xl h-full sm:h-[85vh] max-h-[100vh] sm:max-h-[90vh] shadow-2xl flex flex-col overflow-hidden animate-scale-up">
        {/* HEADER */}
        <div className="px-4 sm:px-6 py-3.5 sm:py-4 border-b border-(--border-color) flex items-center justify-between shrink-0 bg-white dark:bg-[#141820]">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-emerald-100 dark:bg-emerald-500/10 rounded-xl text-emerald-600 dark:text-emerald-500 border border-emerald-200 dark:border-emerald-500/20 shrink-0">
              <Boxes className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-sm font-heading tracking-widest uppercase text-slate-900 dark:text-white">
                Stock Movement History
              </h2>
              <span className="text-xs text-slate-600 dark:text-slate-400 font-medium block mt-0.5">
                {productName
                  ? `Restocking ledger for "${productName}"`
                  : 'Live audit log of all restocked products and supplier notes'}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {onOpenRestockModal && (
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onOpenRestockModal();
                }}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold uppercase tracking-wider cursor-pointer shadow-xs transition-all active:scale-95"
                title="Open Restock Products Editor to record incoming stock"
              >
                <Boxes className="w-4 h-4" />
                <span>Restock Editor</span>
              </button>
            )}

            <button
              type="button"
              onClick={fetchMovements}
              className="p-2 bg-slate-100 hover:bg-slate-200 dark:bg-white/10 dark:hover:bg-white/15 text-slate-600 dark:text-slate-300 rounded-xl transition-all cursor-pointer border border-slate-200 dark:border-white/10 active:scale-95"
              title="Refresh"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
            <button
              type="button"
              onClick={onClose}
              className="p-2 bg-slate-100 hover:bg-slate-200 dark:bg-white/10 dark:hover:bg-white/15 text-slate-600 dark:text-slate-300 rounded-xl transition-all cursor-pointer border border-slate-200 dark:border-white/10 active:scale-95"
              title="Close"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* WORKSPACE & SEARCH */}
        <div className="p-3.5 sm:p-4 border-b border-(--border-color) bg-(--bg-page) shrink-0 flex items-center justify-between gap-3">
          <div className="relative flex-1">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by product name, supplier note, or staff..."
              className="w-full pl-9 pr-3 py-2 border border-slate-300 dark:border-white/10 rounded-xl bg-white dark:bg-[#151922] text-xs text-slate-900 dark:text-slate-100 outline-none focus:border-emerald-500 transition-all font-medium shadow-xs"
            />
          </div>

          <div className="text-xs text-slate-600 dark:text-slate-400 font-mono font-bold uppercase tracking-wider shrink-0">
            {filteredMovements.length} Record{filteredMovements.length === 1 ? '' : 's'}
          </div>
        </div>

        {/* CONTENT */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-3 bg-(--bg-page)">
          {loading ? (
            <div className="flex flex-col items-center justify-center p-12 text-slate-400 space-y-2">
              <Loader2 className="w-6 h-6 animate-spin text-emerald-500" />
              <span className="text-xs">Loading stock movements ledger...</span>
            </div>
          ) : filteredMovements.length === 0 ? (
            <div className="flex flex-col items-center justify-center p-12 text-center border border-dashed border-slate-300 dark:border-white/10 rounded-2xl bg-white dark:bg-[#151922]">
              <div className="w-12 h-12 rounded-2xl bg-emerald-100 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-500 flex items-center justify-center mb-3">
                <Package className="w-6 h-6" />
              </div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                No Stock Movements Recorded
              </h3>
              <p className="text-xs text-slate-600 dark:text-slate-400 mt-1 max-w-sm">
                Record incoming shipments via the Restock Products Editor to log incoming inventory and track supplier notes here.
              </p>
              {onOpenRestockModal && (
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onOpenRestockModal();
                  }}
                  className="mt-4 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold uppercase tracking-wider inline-flex items-center gap-2 cursor-pointer shadow-xs active:scale-95 transition-all"
                >
                  <Boxes className="w-4 h-4" />
                  <span>Open Restock Editor</span>
                </button>
              )}
            </div>
          ) : (
            filteredMovements.map((m) => (
              <div
                key={m.id}
                className="p-4 rounded-2xl border border-(--border-color) bg-(--bg-card) hover:border-slate-400/40 transition-all space-y-2.5 shadow-2xs"
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <span className="px-2 py-0.5 rounded-full text-[9px] font-extrabold uppercase tracking-wider bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30 flex items-center gap-1">
                      <TrendingUp className="w-3 h-3" />
                      {m.movement_type || 'RESTOCK'}
                    </span>
                    <span className="font-heading font-bold text-sm text-(--color-text)">
                      {m.product_name}
                    </span>
                  </div>

                  <div className="flex items-center gap-2">
                    <span className="font-mono text-sm font-extrabold text-emerald-500 bg-emerald-500/10 px-2.5 py-0.5 rounded-lg border border-emerald-500/20">
                      +{m.quantity_added} Units
                    </span>
                  </div>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-2 pt-1 text-[11px] text-slate-400 border-t border-(--border-color)/50">
                  <div className="flex items-center gap-3">
                    <span className="font-mono">
                      Stock: <strong className="text-slate-300">{m.previous_stock}</strong> → <strong className="text-emerald-400">{m.new_stock}</strong>
                    </span>
                    {m.created_by_name && (
                      <span className="flex items-center gap-1">
                        <User className="w-3 h-3 text-slate-400" />
                        <span>{m.created_by_name}</span>
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-1 font-mono text-[10px]">
                    <Calendar className="w-3 h-3" />
                    <span>{format(new Date(m.created_at), 'MMM dd, yyyy • h:mm a')}</span>
                  </div>
                </div>

                {m.note && (
                  <div className="p-2.5 rounded-xl bg-(--bg-page) border border-(--border-color) flex items-start gap-2 text-xs">
                    <FileText className="w-3.5 h-3.5 text-blue-400 shrink-0 mt-0.5" />
                    <div className="min-w-0">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
                        Supplier / Movement Note:
                      </span>
                      <p className="text-slate-700 dark:text-slate-200 font-medium">
                        {m.note}
                      </p>
                    </div>
                  </div>
                )}
              </div>
            ))
          )}
        </div>

        {/* FOOTER */}
        <div className="px-6 py-3 border-t border-(--border-color) bg-(--bg-card) flex justify-end shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 border border-(--border-color) text-slate-400 hover:text-white bg-(--bg-page) rounded-xl text-xs font-bold uppercase tracking-wider cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
};
