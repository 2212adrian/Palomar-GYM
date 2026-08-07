// src/pages/logbook/components/LogbookRecycleBin.tsx
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { 
  X, RotateCcw, Search, AlertCircle, ClipboardList, 
} from 'lucide-react';
import { toast } from 'react-toastify';
import { Modal } from '../../../components/ui/Modal';
import { supabase } from '../../../lib/supabase/client';

interface LogbookRecycleBinProps {
  isOpen: boolean;
  onClose: () => void;
  onRestoreSuccess: () => void;
}

export const LogbookRecycleBin: React.FC<LogbookRecycleBinProps> = ({
  isOpen,
  onClose,
  onRestoreSuccess,
}) => {
  const [deletedLogs, setDeletedLogs] = useState<any[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [countdown, setCountdown] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 5;

  const fetchDeletedLogs = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('attendance')
        .select('*')
        .not('deleted_at', 'is', null)
        .neq('customer_type', 'New Membership') // Exclude New Memberships
        .order('deleted_at', { ascending: false });

      if (error) throw error;

      if (data) {
        // Filter out any subscription records on the client side as a secondary safeguard
        const mappedLogs = data
          .filter((att: any) => {
            const plan = (att.plan_name || '').toLowerCase();
            return att.customer_type !== 'New Membership' && 
                   !plan.includes('membership') && 
                   !plan.includes('subscription');
          })
          .map((att: any) => ({
            id: att.id,
            timestamp: att.check_in_time,
            memberId: att.member_id || null,
            customerName: att.customer_name,
            customerType: att.customer_type,
            categoryOrPlan: att.plan_name || 'Regular Pass',
            amountPaid: Number(att.entry_fee || 0),
            deletedAt: att.deleted_at
          }));

        setDeletedLogs(mappedLogs);
      }
    } catch (err: any) {
      console.error('Error fetching soft-deleted logs:', err);
      toast.error('Failed to load transaction data from Recycle Bin.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isOpen) {
      fetchDeletedLogs();
      setSelectedIds([]);
      setCurrentPage(1);
      setSearchQuery('');
    }
  }, [isOpen, fetchDeletedLogs]);

  useEffect(() => {
    if (!isOpen) return;
    const updateCountdown = () => {
      const now = new Date();
      const nextMidnight = new Date(now);
      nextMidnight.setHours(24, 0, 0, 0);
      const diffMs = nextMidnight.getTime() - now.getTime();
      const hours = Math.floor(diffMs / (1000 * 60 * 60));
      const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
      const seconds = Math.floor((diffMs % (1000 * 60)) / 1000);
      setCountdown(`${String(hours).padStart(2, '0')}h ${String(minutes).padStart(2, '0')}m ${String(seconds).padStart(2, '0')}s`);
    };
    updateCountdown();
    const interval = setInterval(updateCountdown, 1000);
    return () => clearInterval(interval);
  }, [isOpen]);

  const filteredLogs = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    return deletedLogs.filter((l: any) => 
      l.id?.toLowerCase().includes(q) || 
      l.customerName?.toLowerCase().includes(q) || 
      l.customerType?.toLowerCase().includes(q)
    );
  }, [deletedLogs, searchQuery]);

  const paginatedLogs = useMemo(() => {
    const startIdx = (currentPage - 1) * itemsPerPage;
    return filteredLogs.slice(startIdx, startIdx + itemsPerPage);
  }, [filteredLogs, currentPage]);

  const handleBulkRestore = async (selectedList: any[]) => {
    if (selectedList.length === 0) return;
    setLoading(true);
    try {
      const selectedTxIds = selectedList.map((l: any) => l.id);

      const { error } = await supabase
        .from('attendance')
        .update({ deleted_at: null, deleted_by: null })
        .in('id', selectedTxIds);

      if (error) throw error;

      setDeletedLogs(prev => prev.filter(l => !selectedTxIds.includes(l.id)));
      setSelectedIds(prev => prev.filter(id => !selectedTxIds.includes(id)));
      onRestoreSuccess();
      toast.success(`Restored ${selectedList.length} check-in log(s).`);
    } catch (err: any) {
      console.error('Restoration database error:', err);
      toast.error('Restoration database error.');
    } finally {
      setLoading(false);
    }
  };

  const isSelectionActive = selectedIds.length > 0;

  return createPortal(
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Logbook Recycle Bin"
      className="max-w-md p-6 overflow-y-auto max-h-[85vh] font-body text-xs text-left relative z-9999"
    >
      {countdown && (
        <span className="absolute top-6 right-13 text-[10px] font-mono font-black text-rose-500 bg-rose-500/10 border border-rose-500/20 px-2 py-0.5 rounded-md animate-pulse">
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
        <div className="p-3 bg-rose-500/10 border border-rose-500/20 rounded-xl flex items-start gap-2.5 text-[11px] leading-relaxed text-rose-600 dark:text-rose-400">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-rose-500" />
          <span><strong>Notice:</strong> Items deleted today can be restored in 24 hours before automatic purging.</span>
        </div>

        <div className="field-wrap">
          <input
            type="text"
            placeholder=" "
            disabled={loading}
            value={searchQuery}
            onChange={(e) => { setSearchQuery(e.target.value); setCurrentPage(1); }}
            className="field-input pr-10"
          />
          <label className="field-label flex items-center gap-1.5 text-slate-455 uppercase tracking-widest text-[9px]">
            <Search className="w-3.5 h-3.5" />
            <span>Search Deletions...</span>
          </label>
        </div>

        <div className="space-y-3">
          {paginatedLogs.length > 0 ? (
            paginatedLogs.map((tx: any) => {
              const isSelected = selectedIds.includes(tx.id);
              return (
                <div key={tx.id} className="space-y-1.5 animate-fade-in">
                  <div
                    onClick={() => {
                      setSelectedIds(prev => isSelected ? prev.filter(id => id !== tx.id) : [...prev, tx.id]);
                    }}
                    className={`p-3 border rounded-xl flex items-center justify-between gap-3 cursor-pointer transition-all ${
                      isSelected ? 'bg-blue-500/10 border-blue-500' : 'bg-slate-50 hover:bg-slate-100 dark:bg-zinc-900 border-(--border-color)'
                    }`}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => {}}
                        className="w-4.5 h-4.5 rounded text-blue-600 cursor-pointer accent-(--color-primary)"
                      />
                      <div className="min-w-0 text-left font-mono">
                        <span className="font-bold block text-[11px] text-(--color-text) truncate">{tx.customerName}</span>
                        <span className="text-[10px] text-slate-400 mt-0.5 block">{tx.categoryOrPlan}</span>
                      </div>
                    </div>
                    <button
                      type="button"
                      disabled={loading}
                      onClick={(e) => { e.stopPropagation(); handleBulkRestore([tx]); }}
                      className="py-1.5 px-3 bg-emerald-500 hover:bg-emerald-600 text-white rounded-lg font-heading text-[8px] tracking-wider uppercase font-bold cursor-pointer disabled:opacity-50"
                    >
                      Restore
                    </button>
                  </div>
                </div>
              );
            })
          ) : (
            <div className="text-center py-12 text-slate-400 border border-dashed border-(--border-color) rounded-2xl flex flex-col items-center justify-center space-y-3">
              <ClipboardList className="w-8 h-8 animate-pulse text-slate-500" />
              <div>
                <h4 className="font-heading text-sm uppercase tracking-widest text-(--color-text)">No deletions found</h4>
                <p className="text-[10px] font-sans mt-0.5 text-slate-500">Logbook Recycle Bin is clear.</p>
              </div>
            </div>
          )}
        </div>

        {isSelectionActive && (
          <div className="pt-2 border-t border-(--border-color) flex gap-2 w-full">
            <button
              disabled={loading}
              onClick={() => handleBulkRestore(deletedLogs.filter(l => selectedIds.includes(l.id)))}
              className="w-full py-2.5 bg-emerald-500 hover:bg-emerald-600 text-white rounded-xl text-[10px] font-heading tracking-widest uppercase cursor-pointer flex items-center justify-center gap-1.5 font-black disabled:opacity-50"
            >
              <RotateCcw className="w-4 h-4" />
              <span>Restore Selected ({selectedIds.length})</span>
            </button>
          </div>
        )}
      </div>
    </Modal>,
    document.body
  );
};