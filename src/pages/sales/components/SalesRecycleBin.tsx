// src/pages/sales/components/SalesRecycleBin.tsx
import React, { useState, useEffect, useMemo } from 'react';
import { 
  X, RotateCcw, Search, AlertCircle, ShoppingBag, 
  ChevronLeft, ChevronRight, CheckSquare, Square 
} from 'lucide-react';
import { format } from 'date-fns';
import { toast } from 'react-toastify';
import { motion, AnimatePresence } from 'framer-motion';
import { Modal } from '../../../components/ui/Modal';

interface SalesRecycleBinProps {
  isOpen: boolean;
  onClose: () => void;
  products: any[];
  onRestoreSuccess: () => void;
}

// 1-minute gap threshold defines consecutive actions
const CONSECUTIVE_GAP_LIMIT_MS = 1 * 60 * 1000;

export const SalesRecycleBin: React.FC<SalesRecycleBinProps> = ({
  isOpen,
  onClose,
  products,
  onRestoreSuccess,
}) => {
  const [deletedTransactions, setDeletedTransactions] = useState<any[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  
  // Local pagination parameters (Compact size of 5 items per page for modal viewports)
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 5;

  // Load daily deletions on open
  useEffect(() => {
    if (isOpen) {
      const deleted = localStorage.getItem('deleted_transactions') || '[]';
      // Sort newest deletions to oldest on load
      const parsed = JSON.parse(deleted).sort((a: any, b: any) => {
        const timeA = a.archivedAt ? new Date(a.archivedAt).getTime() : 0;
        const timeB = b.archivedAt ? new Date(b.archivedAt).getTime() : 0;
        return timeB - timeA;
      });
      setDeletedTransactions(parsed);
      setSelectedIds([]);
      setCurrentPage(1);
      setSearchQuery('');
    }
  }, [isOpen]);

  // Reset page position on search query mutations
  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery]);

  // Dynamic filter lookup
  const filteredTransactions = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    return deletedTransactions.filter((t: any) => {
      return (
        t.id?.toLowerCase().includes(q) ||
        t.productName?.toLowerCase().includes(q) ||
        t.barcode?.toLowerCase().includes(q) ||
        t.paymentMethod?.toLowerCase().includes(q) ||
        (t.referenceNumber && t.referenceNumber.toLowerCase().includes(q))
      );
    });
  }, [deletedTransactions, searchQuery]);

  // Assign consecutive activity groups based on temporal proximity
  const groupedTransactions = useMemo(() => {
    let currentGroupId = 0;
    let prevTime: number | null = null;

    return filteredTransactions.map((tx, idx) => {
      const timeSource = tx.archivedAt || tx.date;
      const currentTime = timeSource ? new Date(timeSource).getTime() : 0;

      if (idx > 0 && prevTime !== null && currentTime !== 0) {
        // Since list is sorted newest to oldest, prevTime is greater than or equal to currentTime
        const diffMs = prevTime - currentTime;
        if (diffMs > CONSECUTIVE_GAP_LIMIT_MS) {
          currentGroupId++;
        }
      }

      prevTime = currentTime !== 0 ? currentTime : prevTime;
      return { ...tx, groupId: `group-${currentGroupId}` };
    });
  }, [filteredTransactions]);

  // Compute boundaries & selection metadata for each consecutive group
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
        .map((t) => t.archivedAt || t.date)
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

  // Auto-pagination calculations
  const totalItems = groupedTransactions.length;
  const totalPages = Math.ceil(totalItems / itemsPerPage) || 1;
  const clampedPage = Math.min(Math.max(currentPage, 1), totalPages);

  const paginatedTransactions = useMemo(() => {
    const startIdx = (clampedPage - 1) * itemsPerPage;
    return groupedTransactions.slice(startIdx, startIdx + itemsPerPage);
  }, [groupedTransactions, clampedPage]);

  const startIndex = (clampedPage - 1) * itemsPerPage;

  // Composite stock-integrity restorer
  const handleBulkRestore = (selectedList: any[]) => {
    if (selectedList.length === 0) return;

    // 1. Accumulate stock requirements across all selected transactions
    const stockRequirements: { [productId: string]: number } = {};
    selectedList.forEach((tx: any) => {
      const txItems = tx.items || [{ productId: tx.productId, quantity: tx.quantity }];
      txItems.forEach((item: any) => {
        stockRequirements[item.productId] = (stockRequirements[item.productId] || 0) + item.quantity;
      });
    });

    // 2. Evaluate requirements against available inventory stock
    let insufficientStock = false;
    const restoredProductsList = products.map((p: any) => {
      const requiredQty = stockRequirements[p.id];
      if (requiredQty) {
        const stock = p.stock_quantity !== undefined ? p.stock_quantity : (p.stock !== undefined ? p.stock : -1);
        if (stock !== null && stock !== undefined && stock !== -1) {
          if (stock < requiredQty) {
            insufficientStock = true;
          }
          const updatedStock = Math.max(0, stock - requiredQty);
          return p.stock_quantity !== undefined 
            ? { ...p, stock_quantity: updatedStock } 
            : { ...p, stock: updatedStock };
        }
      }
      return p;
    });

    if (insufficientStock) {
      toast.error('Restoration blocked: One or more items exceed available inventory stock.');
      return;
    }

    // 3. Commit stock changes to products database
    localStorage.setItem('products', JSON.stringify(restoredProductsList));

    // 4. Return transactions back to ledger
    const txString = localStorage.getItem('transactions') || '[]';
    const allTx = JSON.parse(txString);
    
    // Strip metadata timestamp
    const cleanRestoredList = selectedList.map((t: any) => {
      const { archivedAt, groupId, ...cleanTx } = t;
      return cleanTx;
    });

    localStorage.setItem('transactions', JSON.stringify([...cleanRestoredList, ...allTx]));

    // 5. Remove from Recycle Bin
    const selectedTxIds = selectedList.map((t: any) => t.id);
    const remainingDeleted = deletedTransactions.filter((t: any) => !selectedTxIds.includes(t.id));
    localStorage.setItem('deleted_transactions', JSON.stringify(remainingDeleted));
    
    setDeletedTransactions(remainingDeleted);
    setSelectedIds([]);
    
    onRestoreSuccess();
    toast.success(`Successfully restored ${selectedList.length} transactions back to ledger.`);
  };

  const handleRowSelect = (id: string) => {
    setSelectedIds(prev => 
      prev.includes(id) ? prev.filter(item => item !== id) : [...prev, id]
    );
  };

  const isGroupFullySelected = (groupId: string) => {
    const groupItemIds = groupMeta[groupId]?.ids || [];
    if (groupItemIds.length === 0) return false;
    return groupItemIds.every(id => selectedIds.includes(id));
  };

  const handleGroupSelect = (groupId: string) => {
    const groupItemIds = groupMeta[groupId]?.ids || [];
    const allSelected = isGroupFullySelected(groupId);
    
    if (allSelected) {
      setSelectedIds(prev => prev.filter(id => !groupItemIds.includes(id)));
    } else {
      setSelectedIds(prev => Array.from(new Set([...prev, ...groupItemIds])));
    }
  };

  const handleToggleSelectAll = () => {
    const currentPageIds = paginatedTransactions.map((t: any) => t.id);
    const allSelectedOnPage = currentPageIds.every(id => selectedIds.includes(id));

    if (allSelectedOnPage) {
      setSelectedIds(prev => prev.filter(id => !currentPageIds.includes(id)));
    } else {
      setSelectedIds(prev => Array.from(new Set([...prev, ...currentPageIds])));
    }
  };

  const isSelectionActive = selectedIds.length > 0;

  // Tracks consecutive timeline group values during mapping loops
  let lastGroupTracker: string | null = null;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Daily Recycle Bin"
      className="max-w-md p-6 overflow-y-auto max-h-[85vh] font-body text-xs text-left relative"
    >
      <button
        type="button"
        onClick={onClose}
        className="absolute top-4 right-4 p-2 rounded-xl text-slate-400 hover:text-[var(--color-text)] hover:bg-slate-100 dark:hover:bg-zinc-800 transition-colors cursor-pointer z-50"
      >
        <X className="w-4.5 h-4.5" />
      </button>

      <div className="space-y-4 pt-2">
        {/* Warning callout banner */}
        <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-xl flex items-start gap-2.5 text-[11px] leading-relaxed text-amber-600">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>Restorable transaction items. This bin is automatically purged at the end of the day.</span>
        </div>

        {/* --- DYNAMIC LOOKUP SEARCH BAR --- */}
        <div className="field-wrap">
          <input
            type="text"
            placeholder=" "
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

        {/* Bulk select header bar */}
        {totalItems > 0 && (
          <div className="flex justify-between items-center bg-slate-100 dark:bg-zinc-900 border border-(--border-color) rounded-xl px-3 py-2 text-[10px] font-bold text-slate-500 uppercase tracking-wider select-none">
            <button
              onClick={handleToggleSelectAll}
              className="flex items-center gap-2 cursor-pointer hover:opacity-85 text-left"
            >
              {paginatedTransactions.length > 0 && paginatedTransactions.every((t: any) => selectedIds.includes(t.id)) ? (
                <CheckSquare className="w-4 h-4 text-[var(--color-primary-light)] shrink-0" />
              ) : (
                <Square className="w-4 h-4 shrink-0" />
              )}
              <span>Select All on Page</span>
            </button>
            <span>{selectedIds.length} Selected</span>
          </div>
        )}

        {/* --- TIMELINE CHRONOLOGY AND CARD LISTINGS --- */}
        <div className="space-y-3">
          {paginatedTransactions.length > 0 ? (
            paginatedTransactions.map((tx: any) => {
              const showGroupHeading = tx.groupId !== lastGroupTracker;
              lastGroupTracker = tx.groupId;

              const isSelected = selectedIds.includes(tx.id);
              const groupSelected = isGroupFullySelected(tx.groupId);

              return (
                <div key={tx.id} className="space-y-1.5">
                  {showGroupHeading && (
                    <div className="flex items-center justify-between border-b border-(--border-color) pt-4 pb-1.5 animate-fade-in select-none">
                      <button
                        type="button"
                        onClick={() => handleGroupSelect(tx.groupId)}
                        className="flex items-center gap-2 cursor-pointer hover:opacity-80 text-left"
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
                    onClick={() => handleRowSelect(tx.id)}
                    className={`p-3 border rounded-xl flex items-center justify-between gap-3 cursor-pointer transition-all ${
                      isSelected 
                        ? 'bg-blue-500/10 border-blue-500' 
                        : 'bg-slate-50 hover:bg-slate-100 dark:bg-zinc-900 dark:hover:bg-zinc-800 border-(--border-color)'
                    }`}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="shrink-0" onClick={(e) => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => handleRowSelect(tx.id)}
                          className="w-4.5 h-4.5 rounded border-slate-300 dark:border-white/10 text-blue-600 cursor-pointer accent-(--color-primary)"
                        />
                      </div>
                      <div className="min-w-0 text-left">
                        <span className="font-bold block text-[11px] text-(--color-text) truncate">{tx.productName}</span>
                        <span className="text-[10px] text-slate-400 font-mono mt-0.5 block leading-none">{tx.id} • ₱{tx.totalAmount.toFixed(2)}</span>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleBulkRestore([tx]);
                      }}
                      className="py-1.5 px-3 bg-emerald-500 text-white rounded-lg font-heading text-[8px] tracking-wider uppercase cursor-pointer hover:bg-emerald-600 font-bold shrink-0 shadow-sm"
                    >
                      Restore
                    </button>
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

        {/* --- SYSTEM-TABLE COMPLIANT PAGINATION ELEMENT --- */}
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
                disabled={clampedPage === 1}
                className="p-1 border border-(--border-color) rounded-lg hover:bg-slate-100 dark:hover:bg-neutral-800 text-slate-700 dark:text-slate-300 disabled:opacity-40 disabled:pointer-events-none cursor-pointer inline-flex items-center justify-center h-7 w-7"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
              </button>

              {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => (
                <button
                  key={page}
                  type="button"
                  onClick={() => setCurrentPage(page)}
                  className={`h-7 w-7 rounded-lg font-mono font-bold transition-all cursor-pointer text-[10px] ${
                    clampedPage === page
                      ? 'bg-[#1b365d] dark:bg-[#bf0202] text-white'
                      : 'border border-(--border-color) text-slate-700 dark:text-slate-350 hover:bg-slate-100 dark:hover:bg-neutral-800'
                  }`}
                >
                  {page}
                </button>
              ))}

              <button
                type="button"
                onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
                disabled={clampedPage === totalPages}
                className="p-1 border border-(--border-color) rounded-lg hover:bg-slate-100 dark:hover:bg-neutral-800 text-slate-700 dark:text-slate-300 disabled:opacity-40 disabled:pointer-events-none cursor-pointer inline-flex items-center justify-center h-7 w-7"
              >
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        )}

        {/* --- STICKY / PINNED BULK RESTORATION ACTION HEADER --- */}
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
                onClick={() => setSelectedIds([])}
                className="flex-1 py-2.5 border border-(--border-color) bg-(--bg-card) text-slate-500 rounded-xl text-[10px] font-heading tracking-widest uppercase cursor-pointer hover:bg-slate-50 transition-colors font-black"
              >
                Deselect All
              </button>
              <button
                type="button"
                onClick={() => handleBulkRestore(deletedTransactions.filter(t => selectedIds.includes(t.id)))}
                className="flex-1 py-2.5 bg-emerald-500 hover:bg-emerald-600 text-white rounded-xl text-[10px] font-heading tracking-widest uppercase cursor-pointer transition-all flex items-center justify-center gap-1.5 shadow-md font-black"
              >
                <RotateCcw className="w-4 h-4 shrink-0" />
                <span>Restore Selected ({selectedIds.length})</span>
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </Modal>
  );
};