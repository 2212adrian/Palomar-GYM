// src/pages/sales/components/ProductRecoveryModal.tsx
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
import { logAudit } from '../../../lib/supabase/audit';

interface DeletedProduct {
  id: string;
  barcode_id: string;
  product_name: string;
  image_url: string | null;
  selling_price: number;
  deleted_at: string;
}

interface ProductRecoveryModalProps {
  isOpen: boolean;
  onClose: () => void;
  onRestoreSuccess: () => void;
}

// 1-minute gap threshold defines consecutive actions
const CONSECUTIVE_GAP_LIMIT_MS = 1 * 60 * 1000;

export const ProductRecoveryModal: React.FC<ProductRecoveryModalProps> = ({
  isOpen,
  onClose,
  onRestoreSuccess
}) => {
  const [deletedItems, setDeletedItems] = useState<DeletedProduct[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  
  // Local pagination parameters (Compact size of 5 items per page for modal viewports)
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 5;

  const fetchDeletedProducts = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('products')
        .select('id, barcode_id, product_name, image_url, selling_price, deleted_at')
        .not('deleted_at', 'is', null)
        .order('deleted_at', { ascending: false });

      if (error) throw error;
      setDeletedItems(data || []);
    } catch (err) {
      console.error(err);
      toast.error('Failed to load transaction data from Recycle Bin.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchDeletedProducts();
      setSelectedIds([]);
      setCurrentPage(1);
      setSearchQuery('');
    }
  }, [isOpen]);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery]);

  // Calculates the remaining retention time for an individual product
  const getDaysRemaining = (deletedAt: string) => {
    if (!deletedAt) return null;
    const deletedTimestamp = new Date(deletedAt).getTime();
    
    // 30 days retention policy limits
    const purgeDate = new Date(deletedTimestamp + 30 * 24 * 60 * 60 * 1000);
    const now = new Date();
    const diffMs = purgeDate.getTime() - now.getTime();

    if (diffMs <= 0) return "Purging...";
    const diffDays = Math.ceil(diffMs / (24 * 60 * 60 * 1000));
    return `${diffDays}d left`;
  };

  const filteredItems = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    return deletedItems.filter((item) => {
      return (
        item.id?.toLowerCase().includes(q) ||
        item.product_name?.toLowerCase().includes(q) ||
        item.barcode_id?.toLowerCase().includes(q)
      );
    });
  }, [deletedItems, searchQuery]);

  // Group items by deletion time proximity (consecutive action streaks)
  const groupedItems = useMemo(() => {
    let currentGroupId = 0;
    let prevTime: number | null = null;

    return filteredItems.map((item, idx) => {
      const currentTime = item.deleted_at ? new Date(item.deleted_at).getTime() : 0;

      if (idx > 0 && prevTime !== null && currentTime !== 0) {
        const diffMs = prevTime - currentTime;
        if (diffMs > CONSECUTIVE_GAP_LIMIT_MS) {
          currentGroupId++;
        }
      }

      prevTime = currentTime !== 0 ? currentTime : prevTime;
      return { ...item, groupId: `group-${currentGroupId}` };
    });
  }, [filteredItems]);

  // Compute boundaries & selection metadata for each consecutive group
  const groupMeta = useMemo(() => {
    const meta: { [groupId: string]: { ids: string[]; label: string } } = {};

    groupedItems.forEach((item) => {
      if (!meta[item.groupId]) {
        meta[item.groupId] = { ids: [], label: '' };
      }
      meta[item.groupId].ids.push(item.id);
    });

    Object.keys(meta).forEach((groupId) => {
      const groupTxs = groupedItems.filter((t) => t.groupId === groupId);
      const times = groupTxs
        .map((t) => t.deleted_at)
        .filter(Boolean)
        .map((t) => new Date(t).getTime());

      if (times.length > 0) {
        const maxTime = Math.max(...times);
        const minTime = Math.min(...times);
        
        // Upgraded format includes Month and Day for proper 30-day tracking
        const formatTime = (ms: number) => format(new Date(ms), 'MMM d, hh:mm a');

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
  }, [groupedItems]);

  // Auto-pagination calculations
  const totalItems = groupedItems.length;
  const totalPages = Math.ceil(totalItems / itemsPerPage) || 1;
  const clampedPage = Math.min(Math.max(currentPage, 1), totalPages);

  const paginatedItems = useMemo(() => {
    const startIdx = (clampedPage - 1) * itemsPerPage;
    return groupedItems.slice(startIdx, startIdx + itemsPerPage);
  }, [groupedItems, clampedPage]);

  const startIndex = (clampedPage - 1) * itemsPerPage;

  const handleBulkRestore = async (selectedList: any[]) => {
    if (selectedList.length === 0) return;
    setLoading(true);

    try {
      const selectedProductIds = selectedList.map((t: any) => t.id);
      
      const { error: restoreError } = await supabase
        .from('products')
        .update({
          deleted_at: null,
          deleted_by: null
        })
        .in('id', selectedProductIds);

      if (restoreError) throw restoreError;

      const restoredDetails = selectedList.map(t => `${t.product_name} (${t.barcode_id})`).join(', ');
      await logAudit(
        'PRODUCTS_RESTORED',
        `Successfully restored ${selectedList.length} products back to inventory:\n\n${restoredDetails}`
      );

      setSelectedIds([]);
      onRestoreSuccess();
      toast.success(`Successfully restored ${selectedList.length} products back to your store catalog.`);
      await fetchDeletedProducts();
    } catch (err) {
      console.error('Error executing database restoration:', err);
      toast.error('Failed to complete product catalog restoration.');
    } finally {
      setLoading(false);
    }
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
    const currentPageIds = paginatedItems.map((t: any) => t.id);
    const allSelectedOnPage = currentPageIds.every(id => selectedIds.includes(id));

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
      title="Product Recycle Bin"
      className="max-w-md p-6 overflow-y-auto max-h-[85vh] font-body text-xs text-left relative"
    >
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
            <strong>Caution:</strong> Restorable items are kept for up to 30 days. Products here are locked and will be permanently deleted at 12:00 AM Manila Time.
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
          <label className="field-label flex items-center gap-1.5 text-slate-455 uppercase tracking-widest text-[9px]">
            <Search className="w-3.5 h-3.5" />
            <span>Search Deletions...</span>
          </label>
          {searchQuery && (
            <button 
              onClick={() => setSearchQuery('')} 
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-655 dark:hover:text-slate-205 text-xs font-bold"
            >
              CLEAR
            </button>
          )}
        </div>

        {totalItems > 0 && (
          <div className="flex justify-between items-center bg-slate-100 dark:bg-zinc-900 border border-(--border-color) rounded-xl px-3 py-2 text-[10px] font-bold text-slate-500 uppercase tracking-wider select-none">
            <button
              onClick={handleToggleSelectAll}
              disabled={loading}
              className="flex items-center gap-2 cursor-pointer hover:opacity-85 text-left disabled:opacity-50"
            >
              {paginatedItems.length > 0 && paginatedItems.every((t: any) => selectedIds.includes(t.id)) ? (
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
          {loading ? (
            <div className="space-y-3">
              {[...Array(3)].map((_, i) => (
                <div key={i} className="p-3 bg-slate-100/50 dark:bg-zinc-900/50 border border-(--border-color) rounded-xl animate-pulse flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <div className="w-4.5 h-4.5 bg-slate-200 dark:bg-zinc-800 rounded shrink-0" />
                    <div className="w-10 h-10 bg-slate-200 dark:bg-zinc-800 rounded-lg shrink-0" />
                    <div className="min-w-0 flex-1 space-y-2 text-left">
                      <div className="h-3.5 bg-slate-200 dark:bg-zinc-800 rounded w-1/2" />
                      <div className="h-2.5 bg-slate-200 dark:bg-zinc-800 rounded w-1/3" />
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <div className="h-5 bg-slate-200 dark:bg-zinc-800 rounded w-10 shrink-0" />
                    <div className="h-6 bg-slate-200 dark:bg-zinc-800 rounded w-12 shrink-0" />
                  </div>
                </div>
              ))}
            </div>
          ) : paginatedItems.length > 0 ? (
            paginatedItems.map((item: any) => {
              const showGroupHeading = item.groupId !== lastGroupTracker;
              lastGroupTracker = item.groupId;

              const isSelected = selectedIds.includes(item.id);
              const groupSelected = isGroupFullySelected(item.groupId);
              const daysRemaining = getDaysRemaining(item.deleted_at);

              return (
                <div key={item.id} className="space-y-1.5 animate-fade-in">
                  {showGroupHeading && (
                    <div className="flex items-center justify-between border-b border-(--border-color) pt-4 pb-1.5 select-none">
                      <button
                        type="button"
                        disabled={loading}
                        onClick={() => handleGroupSelect(item.groupId)}
                        className="flex items-center gap-2 cursor-pointer hover:opacity-80 text-left disabled:opacity-50 font-bold"
                      >
                        {groupSelected ? (
                          <CheckSquare className="w-4 h-4 text-[var(--color-primary-light)] shrink-0" />
                        ) : (
                          <Square className="w-4 h-4 text-slate-400 dark:text-zinc-600 shrink-0" />
                        )}
                        <span className="text-[9px] font-heading tracking-widest text-[var(--color-primary-light)] uppercase">
                          {groupMeta[item.groupId]?.label}
                        </span>
                      </button>
                      <span className="text-[9px] text-slate-400 font-medium font-mono">
                        ({groupMeta[item.groupId]?.ids.length} item{groupMeta[item.groupId]?.ids.length !== 1 && 's'})
                      </span>
                    </div>
                  )}

                  <div
                    onClick={() => !loading && handleRowSelect(item.id)}
                    className={`p-3 border rounded-xl flex items-center justify-between gap-3 cursor-pointer transition-all ${
                      isSelected 
                        ? 'bg-blue-500/10 border-blue-500' 
                        : 'bg-slate-50 hover:bg-slate-100 dark:bg-zinc-900 dark:hover:bg-zinc-800 border-(--border-color)'
                    } ${loading ? 'opacity-60 cursor-not-allowed' : ''}`}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="shrink-0" onClick={(e) => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          disabled={loading}
                          checked={isSelected}
                          onChange={() => handleRowSelect(item.id)}
                          className="w-4.5 h-4.5 rounded border-slate-300 dark:border-white/10 text-blue-600 cursor-pointer accent-(--color-primary)"
                        />
                      </div>
                      <div className="min-w-0 text-left flex items-center gap-3">
                        {item.image_url ? (
                          <img 
                            src={item.image_url} 
                            alt={item.product_name} 
                            className="w-10 h-10 rounded-lg object-cover border border-(--border-color) shrink-0 grayscale opacity-70" 
                          />
                        ) : (
                          <div className="w-10 h-10 rounded-lg bg-(--bg-page) border border-(--border-color) flex items-center justify-center text-slate-450 font-bold text-xs shrink-0 select-none uppercase">
                            {item.product_name[0]}
                          </div>
                        )}
                        <div className="min-w-0">
                          <span className="font-bold block text-[11px] text-(--color-text) truncate">{item.product_name}</span>
                          <span className="text-[10px] text-slate-400 font-mono mt-0.5 block leading-none">
                            {item.barcode_id} • ₱{Number(item.selling_price).toFixed(2)}
                          </span>
                        </div>
                      </div>
                    </div>
                    
                    {/* Retention and Restore Controls */}
                    <div 
                      className="flex items-center gap-2 shrink-0" 
                      onClick={(e) => e.stopPropagation()}
                    >
                      {daysRemaining && (
                        <span className="text-[9px] font-mono font-bold text-rose-500 bg-rose-500/10 border border-rose-500/20 px-2 py-1 rounded-md whitespace-nowrap">
                          {daysRemaining}
                        </span>
                      )}
                      <button
                        type="button"
                        disabled={loading}
                        onClick={() => handleBulkRestore([item])}
                        className="py-1.5 px-3 bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50 text-white rounded-lg font-heading text-[8px] tracking-wider uppercase cursor-pointer font-bold shrink-0 shadow-sm"
                      >
                        Restore
                      </button>
                    </div>
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
                onClick={() => handleBulkRestore(deletedItems.filter(t => selectedIds.includes(t.id)))}
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