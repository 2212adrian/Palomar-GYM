// src/pages/logbook/components/LogbookRecycleBin.tsx
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { createPortal } from 'react-dom';
import {
  X,
  RotateCcw,
  Search,
  AlertCircle,
  ClipboardList,
  CreditCard,
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
        .neq('customer_type', 'New Membership')
        .order('deleted_at', { ascending: false });

      if (error) throw error;

      if (data) {
        const mappedLogs = data
          .filter((att: any) => att.customer_type !== 'New Membership')
          .map((att: any) => ({
            id: String(att.id),
            timestamp: att.check_in_time,
            memberId: att.member_id || null,
            customerName: att.customer_name || 'Unnamed',
            customerType: att.customer_type,
            categoryOrPlan: att.plan_name || 'Regular Pass',
            amountPaid: Number(att.entry_fee || 0),
            deletedAt: att.deleted_at,
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
      setCountdown(
        `${String(hours).padStart(2, '0')}h ${String(minutes).padStart(2, '0')}m ${String(seconds).padStart(2, '0')}s`
      );
    };
    updateCountdown();
    const interval = setInterval(updateCountdown, 1000);
    return () => clearInterval(interval);
  }, [isOpen]);

  const filteredLogs = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return deletedLogs;
    return deletedLogs.filter(
      (l: any) =>
        String(l.id || '')
          .toLowerCase()
          .includes(q) ||
        String(l.customerName || '')
          .toLowerCase()
          .includes(q) ||
        String(l.customerType || '')
          .toLowerCase()
          .includes(q) ||
        String(l.categoryOrPlan || '')
          .toLowerCase()
          .includes(q)
    );
  }, [deletedLogs, searchQuery]);

  const paginatedLogs = useMemo(() => {
    const startIdx = (currentPage - 1) * itemsPerPage;
    return filteredLogs.slice(startIdx, startIdx + itemsPerPage);
  }, [filteredLogs, currentPage]);

  const checkDuplicateActiveAttendance = async (log: any): Promise<boolean> => {
    const isCard =
      log.customerType === 'Card' ||
      String(log.categoryOrPlan || '')
        .toLowerCase()
        .includes('card');

    // For Card transactions, check if the member already has an active PAID card
    if (isCard) {
      if (!log.memberId) return false;
      const { data: activeCards } = await supabase
        .from('member_cards')
        .select('id, status, payment_status')
        .eq('member_id', log.memberId)
        .eq('status', 'Active')
        .eq('payment_status', 'PAID')
        .is('deleted_at', null);

      return !!(activeCards && activeCards.length > 0);
    }

    // Standard attendance check
    if (!log.timestamp) return false;
    const dateStr = log.timestamp.split('T')[0];
    const startOfDay = `${dateStr}T00:00:00.000Z`;
    const endOfDay = `${dateStr}T23:59:59.999Z`;

    let query = supabase
      .from('attendance')
      .select('id, customer_name, check_in_time')
      .is('deleted_at', null)
      .neq('customer_type', 'Card')
      .not('plan_name', 'ilike', '%card%')
      .gte('check_in_time', startOfDay)
      .lte('check_in_time', endOfDay);

    if (log.memberId) {
      query = query.eq('member_id', log.memberId);
    } else if (log.customerName) {
      query = query.ilike('customer_name', log.customerName);
    } else {
      return false;
    }

    const { data, error } = await query;
    if (error) {
      console.warn('Error verifying active duplicate attendance:', error);
      return false;
    }
    return !!(data && data.length > 0);
  };

  const handleBulkRestore = async (selectedList: any[]) => {
    if (selectedList.length === 0) return;
    setLoading(true);
    try {
      const duplicates: any[] = [];
      const validToRestore: any[] = [];

      for (const log of selectedList) {
        const isDuplicate = await checkDuplicateActiveAttendance(log);
        if (isDuplicate) {
          duplicates.push(log);
        } else {
          validToRestore.push(log);
        }
      }

      if (duplicates.length > 0) {
        const dupNames = duplicates.map((d) => d.customerName).join(', ');
        if (validToRestore.length === 0) {
          toast.error(
            `Cannot restore: Active record already exists for ${dupNames}.`
          );
          setLoading(false);
          return;
        } else {
          toast.warn(
            `Skipped ${duplicates.length} duplicate record(s) (${dupNames}) because an active record already exists.`
          );
        }
      }

      if (validToRestore.length === 0) {
        setLoading(false);
        return;
      }

      const restoreTxIds = validToRestore.map((l: any) => l.id);

      // 1. Restore Attendance Table Entries
      const { error: attError } = await supabase
        .from('attendance')
        .update({ deleted_at: null, deleted_by: null })
        .in('id', restoreTxIds);

      if (attError) throw attError;

      // 2. Reactivate Member Cards in member_cards Table
      const cardMemberIds = Array.from(
        new Set(
          validToRestore
            .filter(
              (l: any) =>
                l.memberId &&
                (l.customerType === 'Card' ||
                  String(l.categoryOrPlan || '')
                    .toLowerCase()
                    .includes('card'))
            )
            .map((l: any) => l.memberId)
        )
      );

      if (cardMemberIds.length > 0) {
        const { error: cardError } = await supabase
          .from('member_cards')
          .update({
            status: 'Active',
            payment_status: 'PAID',
            deleted_at: null,
          })
          .in('member_id', cardMemberIds);

        if (cardError) {
          console.warn('Error restoring member_cards state:', cardError);
        }
      }

      setDeletedLogs((prev) =>
        prev.filter((l) => !restoreTxIds.includes(l.id))
      );
      setSelectedIds((prev) => prev.filter((id) => !restoreTxIds.includes(id)));
      onRestoreSuccess();
      toast.success(
        `Successfully restored ${validToRestore.length} record(s).`
      );
    } catch (err: any) {
      console.error('Restoration database error:', err);
      toast.error(err.message || 'Restoration database error.');
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
      className="max-w-md p-6 overflow-y-auto max-h-[85vh] font-body text-xs text-left relative z-[9999]"
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
          <span>
            <strong>Notice:</strong> Items deleted today can be restored within
            24 hours before automatic purging.
          </span>
        </div>

        <div className="field-wrap">
          <input
            type="text"
            placeholder=" "
            disabled={loading}
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              setCurrentPage(1);
            }}
            className="field-input pr-10"
          />
          <label className="field-label flex items-center gap-1.5 text-slate-400 uppercase tracking-widest text-[9px]">
            <Search className="w-3.5 h-3.5" />
            <span>Search Deletions...</span>
          </label>
        </div>

        <div className="space-y-3">
          {paginatedLogs.length > 0 ? (
            paginatedLogs.map((tx: any) => {
              const isSelected = selectedIds.includes(tx.id);
              const isCard =
                tx.customerType === 'Card' ||
                String(tx.categoryOrPlan || '')
                  .toLowerCase()
                  .includes('card');

              return (
                <div key={tx.id} className="space-y-1.5 animate-fade-in">
                  <div
                    onClick={() => {
                      setSelectedIds((prev) =>
                        isSelected
                          ? prev.filter((id) => id !== tx.id)
                          : [...prev, tx.id]
                      );
                    }}
                    className={`p-3 border rounded-xl flex items-center justify-between gap-3 cursor-pointer transition-all ${
                      isSelected
                        ? 'bg-blue-500/10 border-blue-500'
                        : 'bg-slate-50 hover:bg-slate-100 dark:bg-zinc-900 border-(--border-color)'
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
                        <div className="flex items-center gap-1.5">
                          <span className="font-bold block text-[11px] text-(--color-text) truncate">
                            {tx.customerName}
                          </span>
                          {isCard && (
                            <span className="px-1.5 py-0.2 bg-blue-500/10 text-blue-600 border border-blue-500/30 rounded text-[8px] font-bold uppercase flex items-center gap-0.5">
                              <CreditCard className="w-2.5 h-2.5" />
                              Card
                            </span>
                          )}
                        </div>
                        <span className="text-[10px] text-slate-400 mt-0.5 block">
                          {tx.categoryOrPlan}
                        </span>
                      </div>
                    </div>
                    <button
                      type="button"
                      disabled={loading}
                      onClick={(e) => {
                        e.stopPropagation();
                        handleBulkRestore([tx]);
                      }}
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
                <h4 className="font-heading text-sm uppercase tracking-widest text-(--color-text)">
                  No deletions found
                </h4>
                <p className="text-[10px] font-sans mt-0.5 text-slate-500">
                  Logbook Recycle Bin is clear.
                </p>
              </div>
            </div>
          )}
        </div>

        {isSelectionActive && (
          <div className="pt-2 border-t border-(--border-color) flex gap-2 w-full">
            <button
              disabled={loading}
              onClick={() =>
                handleBulkRestore(
                  deletedLogs.filter((l) => selectedIds.includes(l.id))
                )
              }
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
