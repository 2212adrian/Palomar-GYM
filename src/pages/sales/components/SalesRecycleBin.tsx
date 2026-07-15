// src/pages/sales/components/SalesRecycleBin.tsx
import React, { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { 
  X, RotateCcw, Search, AlertCircle, ShoppingBag, 
  ChevronLeft, ChevronRight, CheckSquare, Square 
} from 'lucide-react';
import { format } from 'date-fns';
import { toast } from 'react-toastify';
import { motion, AnimatePresence } from 'framer-motion';
import { Modal } from '../../../components/ui/Modal';
import { supabase } from '../../../lib/supabase/client';

interface SalesRecycleBinProps {
  isOpen: boolean;
  onClose: () => void;
  products: any[];
  onRestoreSuccess: () => void;
}

// 1-minute gap threshold defines consecutive actions
const CONSECUTIVE_GAP_LIMIT_MS = 1 * 60 * 1000;

// Helper to determine if a record is older than 24 hours
const isOlderThan24Hours = (dateString: string | null) => {
  if (!dateString) return false;
  const date = new Date(dateString);
  const now = new Date();
  return now.getTime() - date.getTime() > 24 * 60 * 60 * 1000;
};

export const SalesRecycleBin: React.FC<SalesRecycleBinProps> = ({
  isOpen,
  onClose,
  products: parentProducts,
  onRestoreSuccess,
}) => {
  const [deletedTransactions, setDeletedTransactions] = useState<any[]>([]);
  const [, setDbProducts] = useState<any[]>(parentProducts);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [countdown, setCountdown] = useState('');
  
  // Local pagination parameters (Compact size of 5 items per page for modal viewports)
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 5;

  // Fetch soft-deleted records from Supabase
  const fetchDeletedTransactions = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('sales')
        .select('*')
        .not('deleted_at', 'is', null)
        .order('deleted_at', { ascending: false });

      if (error) throw error;

      const { data: latestProducts, error: prodError } = await supabase
        .from('products')
        .select('*')
        .is('deleted_at', null);

      if (!prodError && latestProducts) {
        setDbProducts(latestProducts);
      }

      const mapped = (data || []).map((t: any) => ({
        ...t,
        productName: t.product_name,
        totalAmount: Number(t.total_amount),
        archivedAt: t.deleted_at,
        items: t.items || [],
        paymentMethod: t.payment_method
      }));

      setDeletedTransactions(mapped);
    } catch (err) {
      console.error('Error fetching soft-deleted transactions:', err);
      toast.error('Failed to load transaction data from Recycle Bin.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchDeletedTransactions();
      setSelectedIds([]);
      setCurrentPage(1);
      setSearchQuery('');
    }
  }, [isOpen]);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery]);

  // Real-time calculation of countdown remaining until 12:00 AM Manila Time (GMT+8)
  useEffect(() => {
    if (!isOpen) return;

    const updateCountdown = () => {
      const now = new Date();
      // Calculate UTC time, then convert to Manila (GMT+8) Time
      const manilaOffsetMs = 8 * 60 * 60 * 1000;
      const utcTime = now.getTime() + now.getTimezoneOffset() * 60 * 1000;
      const manilaLocalTime = new Date(utcTime + manilaOffsetMs);
      
      // Target next midnight in Manila timezone (12:00 AM of next local calendar day)
      const manilaMidnightLocal = new Date(manilaLocalTime);
      manilaMidnightLocal.setHours(24, 0, 0, 0);
      
      const diffMs = manilaMidnightLocal.getTime() - manilaLocalTime.getTime();
      
      if (diffMs <= 0) {
        setCountdown("00h 00m 00s");
        return;
      }
      
      const hours = Math.floor(diffMs / (1000 * 60 * 60));
      const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
      const seconds = Math.floor((diffMs % (1000 * 60)) / 1000);
      
      const pad = (num: number) => String(num).padStart(2, '0');
      setCountdown(`${pad(hours)}h ${pad(minutes)}m ${pad(seconds)}s`);
    };

    updateCountdown();
    const interval = setInterval(updateCountdown, 1000);

    return () => clearInterval(interval);
  }, [isOpen]);

  const filteredTransactions = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    return deletedTransactions.filter((t: any) => {
      return (
        t.id?.toLowerCase().includes(q) ||
        t.productName?.toLowerCase().includes(q) ||
        t.paymentMethod?.toLowerCase().includes(q) ||
        t.receipt_no?.toLowerCase().includes(q) ||
        (t.reference_number && t.reference_number.toLowerCase().includes(q))
      );
    });
  }, [deletedTransactions, searchQuery]);

  const groupedTransactions = useMemo(() => {
    let currentGroupId = 0;
    let prevTime: number | null = null;

    return filteredTransactions.map((tx, idx) => {
      const timeSource = tx.archivedAt;
      const currentTime = timeSource ? new Date(timeSource).getTime() : 0;

      if (idx > 0 && prevTime !== null && currentTime !== 0) {
        const diffMs = prevTime - currentTime;
        if (diffMs > CONSECUTIVE_GAP_LIMIT_MS) {
          currentGroupId++;
        }
      }

      prevTime = currentTime !== 0 ? currentTime : prevTime;
      return { ...tx, groupId: `group-${currentGroupId}` };
    });
  }, [filteredTransactions]);

  const groupMeta = useMemo(() => {
    const meta: { [groupId: string]: { ids: string[]; label: string } } = {};

    groupedTransactions.forEach((tx) => {
      if (!meta[tx.groupId]) {
        meta[tx.groupId] = { ids: [], label: '' };
      }
      meta[tx.groupId].ids.push(tx.id);
    });

    Object.keys(meta).forEach((groupId) => {
      const groupTxs = groupedTransactions.filter((t) => t.groupId === groupId);
      const times = groupTxs
        .map((t) => t.archivedAt)
        .filter(Boolean)
        .map((t) => new Date(t).getTime());

      if (times.length > 0) {
        const maxTime = Math.max(...times);
        const minTime = Math.min(...times);
        const formatTime = (ms: number) => format(new Date(ms), 'hh:mm a');

        if (formatTime(maxTime) === formatTime(minTime)) {
          meta[groupId].label = `Batch at ${formatTime(maxTime)}`;
        } else {
          meta[groupId].label = `Batch: ${formatTime(minTime)} - ${formatTime(maxTime)}`;
        }
      } else {
        meta[groupId].label = 'Consecutive Batch';
      }
    });

    return meta;
  }, [groupedTransactions]);

  const totalItems = groupedTransactions.length;
  const totalPages = Math.ceil(totalItems / itemsPerPage) || 1;
  const clampedPage = Math.min(Math.max(currentPage, 1), totalPages);

  const paginatedTransactions = useMemo(() => {
    const startIdx = (clampedPage - 1) * itemsPerPage;
    return groupedTransactions.slice(startIdx, startIdx + itemsPerPage);
  }, [groupedTransactions, clampedPage]);

  const startIndex = (clampedPage - 1) * itemsPerPage;

  const handleBulkRestore = async (selectedList: any[]) => {
    const restorableList = selectedList.filter((t: any) => !isOlderThan24Hours(t.archivedAt));
    if (restorableList.length === 0) {
      toast.error('No restorable items selected. Selected items are older than 24 hours.');
      return;
    }
    setLoading(true);

    try {
      const selectedTxIds = restorableList.map((t: any) => t.id);
      
      const { error: restoreError } = await supabase
        .from('sales')
        .update({
          deleted_at: null,
          deleted_by: null
        })
        .in('id', selectedTxIds);

      if (restoreError) throw restoreError;

      setSelectedIds(prev => prev.filter(id => !selectedTxIds.includes(id)));
      onRestoreSuccess();
      toast.success(`Successfully restored ${restorableList.length} transactions back to the database ledger.`);
      await fetchDeletedTransactions();
    } catch (err) {
      console.error('Error executing database restoration:', err);
      toast.error('Failed to complete transaction database restoration.');
    } finally {
      setLoading(false);
    }
  };

  const handleRowSelect = (id: string, isExpired: boolean) => {
    if (isExpired) return;
    setSelectedIds(prev => 
      prev.includes(id) ? prev.filter(item => item !== id) : [...prev, id]
    );
  };

  const isGroupFullySelected = (groupId: string) => {
    const groupItemIds = (groupMeta[groupId]?.ids || []).filter(id => {
      const tx = deletedTransactions.find(t => t.id === id);
      return tx && !isOlderThan24Hours(tx.archivedAt);
    });
    if (groupItemIds.length === 0) return false;
    return groupItemIds.every(id => selectedIds.includes(id));
  };

  const handleGroupSelect = (groupId: string) => {
    const groupItemIds = (groupMeta[groupId]?.ids || []).filter(id => {
      const tx = deletedTransactions.find(t => t.id === id);
      return tx && !isOlderThan24Hours(tx.archivedAt);
    });
    const allSelected = groupItemIds.length > 0 && groupItemIds.every(id => selectedIds.includes(id));
    
    if (allSelected) {
      setSelectedIds(prev => prev.filter(id => !groupItemIds.includes(id)));
    } else {
      setSelectedIds(prev => Array.from(new Set([...prev, ...groupItemIds])));
    }
  };

  const handleToggleSelectAll = () => {
    const currentPageIds = paginatedTransactions
      .filter((t: any) => !isOlderThan24Hours(t.archivedAt))
      .map((t: any) => t.id);
    const allSelectedOnPage = currentPageIds.length > 0 && currentPageIds.every(id => selectedIds.includes(id));

    if (allSelectedOnPage) {
      setSelectedIds(prev => prev.filter(id => !currentPageIds.includes(id)));
    } else {
      setSelectedIds(prev => Array.from(new Set([...prev, ...currentPageIds])));
    }
  };

  const isSelectionActive = selectedIds.length > 0;
  let lastGroupTracker: string | null = null;

  return createPortal(
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Daily Recycle Bin"
      className="max-w-md p-6 overflow-y-auto max-h-[85vh] font-body text-xs text-left relative z-9999"
    >
      {/* 24-Hour countdown timer beside X close button */}
      {countdown && (
        <span className="absolute top-6 right-13 text-[10px] font-mono font-black text-rose-500 bg-rose-500/10 border border-rose-500/20 px-2 py-0.5 rounded-md animate-pulse whitespace-nowrap">
          Purge in: {countdown}
        </span>
      )}

      <button
        type="button"
        disabled={loading}
        onClick={onClose}
        className="absolute top-4 right-4 p-2 rounded-xl text-slate-400 hover:text-[var(--color-text)] hover:bg-slate-100 dark:hover:bg-zinc-800 transition-colors cursor-pointer z-50"
      >
        <X className="w-4.5 h-4.5" />
      </button>

      <div className="space-y-4 pt-2">
        {/* Warning callout banner with Red Exclamation Caution styling */}
        <div className="p-3 bg-rose-500/10 border border-rose-500/20 rounded-xl flex items-start gap-2.5 text-[11px] leading-relaxed text-rose-600 dark:text-rose-400">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-rose-500" />
          <span>
            <strong>Caution:</strong> Restorable items are kept for up to 24 hours. Transactions older than 24 hours are locked and will be permanently deleted at 12:00 AM Manila Time.
          </span>
        </div>

        <div className="field-wrap">
          <input
            type="text"
            placeholder=" "
            disabled={loading}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="field-input pr-10"
          />
          <label className="field-label flex items-center gap-1.5 text-slate-450 uppercase tracking-widest text-[9px]">
            <Search className="w-3.5 h-3.5" />
            <span>Search Deletions...</span>
          </label>
          {searchQuery && (
            <button 
              onClick={() => setSearchQuery('')} 
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 text-xs font-bold"
            >
              CLEAR
            </button>
          )}
        </div>

        {totalItems > 0 && (
          <div className="flex justify-between items-center bg-slate-100 dark:bg-zinc-900 border border-(--border-color) rounded-xl px-3 py-2 text-[10px] font-bold text-slate-500 uppercase tracking-wider select-none">
            <button
              onClick={handleToggleSelectAll}
              disabled={loading || paginatedTransactions.every((t: any) => isOlderThan24Hours(t.archivedAt))}
              className="flex items-center gap-2 cursor-pointer hover:opacity-85 text-left disabled:opacity-50"
            >
              {paginatedTransactions.length > 0 && 
               paginatedTransactions
                 .filter((t: any) => !isOlderThan24Hours(t.archivedAt))
                 .every((t: any) => selectedIds.includes(t.id)) ? (
                <CheckSquare className="w-4 h-4 text-[var(--color-primary-light)] shrink-0" />
              ) : (
                <Square className="w-4 h-4 shrink-0" />
              )}
              <span>Select All on Page</span>
            </button>
            <span>{selectedIds.length} Selected</span>
          </div>
        )}

        <div className="space-y-3">
          {paginatedTransactions.length > 0 ? (
            paginatedTransactions.map((tx: any) => {
              const showGroupHeading = tx.groupId !== lastGroupTracker;
              lastGroupTracker = tx.groupId;

              const isSelected = selectedIds.includes(tx.id);
              const groupSelected = isGroupFullySelected(tx.groupId);
              const isExpired = isOlderThan24Hours(tx.archivedAt);

              return (
                <div key={tx.id} className="space-y-1.5 animate-fade-in">
                  {showGroupHeading && (
                    <div className="flex items-center justify-between border-b border-(--border-color) pt-4 pb-1.5 select-none">
                      <button
                        type="button"
                        disabled={loading || (groupMeta[tx.groupId]?.ids || []).every(id => {
                          const item = deletedTransactions.find(t => t.id === id);
                          return item && isOlderThan24Hours(item.archivedAt);
                        })}
                        onClick={() => handleGroupSelect(tx.groupId)}
                        className="flex items-center gap-2 cursor-pointer hover:opacity-80 text-left disabled:opacity-50"
                      >
                        {groupSelected ? (
                          <CheckSquare className="w-4 h-4 text-[var(--color-primary-light)] shrink-0" />
                        ) : (
                          <Square className="w-4 h-4 text-slate-400 dark:text-zinc-600 shrink-0" />
                        )}
                        <span className="text-[9px] font-heading tracking-widest text-[var(--color-primary-light)] uppercase font-bold">
                          {groupMeta[tx.groupId]?.label}
                        </span>
                      </button>
                      <span className="text-[9px] text-slate-400 font-medium font-mono">
                        ({groupMeta[tx.groupId]?.ids.length} item{groupMeta[tx.groupId]?.ids.length !== 1 && 's'})
                      </span>
                    </div>
                  )}

                  <div
                    onClick={() => !loading && !isExpired && handleRowSelect(tx.id, isExpired)}
                    className={`p-3 border rounded-xl flex items-center justify-between gap-3 cursor-pointer transition-all ${
                      isSelected 
                        ? 'bg-blue-500/10 border-blue-500' 
                        : isExpired
                          ? 'bg-slate-200/50 dark:bg-zinc-950/50 border-dashed border-slate-300 dark:border-zinc-800 opacity-60 cursor-not-allowed'
                          : 'bg-slate-50 hover:bg-slate-100 dark:bg-zinc-900 dark:hover:bg-zinc-800 border-(--border-color)'
                    } ${loading ? 'opacity-60 cursor-not-allowed' : ''}`}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="shrink-0" onClick={(e) => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          disabled={loading || isExpired}
                          checked={isSelected && !isExpired}
                          onChange={() => handleRowSelect(tx.id, isExpired)}
                          className="w-4.5 h-4.5 rounded border-slate-300 dark:border-white/10 text-blue-600 cursor-pointer accent-(--color-primary) disabled:opacity-40 disabled:cursor-not-allowed"
                        />
                      </div>
                      <div className="min-w-0 text-left">
                        <span className="font-bold block text-[11px] text-(--color-text) truncate">{tx.productName}</span>
                        <span className="text-[10px] text-slate-400 font-mono mt-0.5 block leading-none">
                          {tx.receipt_no} • ₱{tx.totalAmount.toFixed(2)}
                          {isExpired && <span className="text-rose-500 dark:text-rose-400 ml-2 font-bold">(Locked - Older than 24h)</span>}
                        </span>
                      </div>
                    </div>
                    {isExpired ? (
                      <span className="py-1.5 px-3 bg-slate-300 dark:bg-zinc-800 text-slate-500 dark:text-slate-455 rounded-lg font-heading text-[8px] tracking-wider uppercase font-bold shrink-0 border border-slate-400/20">
                        Expired
                      </span>
                    ) : (
                      <button
                        type="button"
                        disabled={loading}
                        onClick={(e) => {
                          e.stopPropagation();
                          handleBulkRestore([tx]);
                        }}
                        className="py-1.5 px-3 bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50 text-white rounded-lg font-heading text-[8px] tracking-wider uppercase cursor-pointer font-bold shrink-0 shadow-sm"
                      >
                        Restore
                      </button>
                    )}
                  </div>
                </div>
              );
            })
          ) : (
            <div className="text-center py-12 text-slate-400 border border-dashed border-(--border-color) rounded-2xl flex flex-col items-center justify-center space-y-3">
              <ShoppingBag className="w-8 h-8 animate-pulse text-slate-500" />
              <div>
                <h4 className="font-heading text-sm uppercase tracking-widest text-(--color-text)">No deletions found</h4>
                <p className="text-[10px] font-sans mt-0.5 text-slate-500">Recycle Bin is completely clear.</p>
              </div>
            </div>
          )}
        </div>

        {totalItems > 0 && totalPages > 1 && (
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 mt-4 pt-2 text-[10px] font-body">
            <span className="text-slate-500">
              Showing <span className="font-semibold text-(--color-text)">{startIndex + 1}</span> to{' '}
              <span className="font-semibold text-(--color-text)">{Math.min(startIndex + itemsPerPage, totalItems)}</span> of{' '}
              <span className="font-semibold text-(--color-text)">{totalItems}</span> entries
            </span>

            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                disabled={clampedPage === 1 || loading}
                className="p-1 border border-(--border-color) rounded-lg hover:bg-slate-100 dark:hover:bg-neutral-800 text-slate-700 dark:text-slate-300 disabled:opacity-40 disabled:pointer-events-none cursor-pointer inline-flex items-center justify-center h-7 w-7"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
              </button>

              {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => (
                <button
                  key={page}
                  type="button"
                  disabled={loading}
                  onClick={() => setCurrentPage(page)}
                  className={`h-7 w-7 rounded-lg font-mono font-bold transition-all cursor-pointer text-[10px] disabled:opacity-50 ${
                    clampedPage === page
                      ? 'bg-[#1b365d] dark:bg-[#bf0202] text-white'
                      : 'border border-(--border-color) text-slate-700 dark:text-slate-355 hover:bg-slate-100 dark:hover:bg-neutral-800'
                  }`}
                >
                  {page}
                </button>
              ))}

              <button
                type="button"
                onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
                disabled={clampedPage === totalPages || loading}
                className="p-1 border border-(--border-color) rounded-lg hover:bg-slate-100 dark:hover:bg-neutral-800 text-slate-700 dark:text-slate-300 disabled:opacity-40 disabled:pointer-events-none cursor-pointer inline-flex items-center justify-center h-7 w-7"
              >
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        )}

        <AnimatePresence>
          {isSelectionActive && (
            <motion.div
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 15 }}
              className="pt-2 border-t border-(--border-color) flex gap-2 w-full animate-fade-in"
            >
              <button
                type="button"
                disabled={loading}
                onClick={() => setSelectedIds([])}
                className="flex-1 py-2.5 border border-(--border-color) bg-(--bg-card) text-slate-500 rounded-xl text-[10px] font-heading tracking-widest uppercase cursor-pointer hover:bg-slate-50 transition-colors font-black disabled:opacity-50"
              >
                Deselect All
              </button>
              <button
                type="button"
                disabled={loading}
                onClick={() => handleBulkRestore(deletedTransactions.filter(t => selectedIds.includes(t.id)))}
                className="flex-1 py-2.5 bg-emerald-500 hover:bg-emerald-600 text-white rounded-xl text-[10px] font-heading tracking-widest uppercase cursor-pointer transition-all flex items-center justify-center gap-1.5 shadow-md font-black disabled:opacity-50"
              >
                <RotateCcw className="w-4 h-4 shrink-0" />
                <span>Restore Selected ({selectedIds.length})</span>
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </Modal>,
    document.body
  );
};