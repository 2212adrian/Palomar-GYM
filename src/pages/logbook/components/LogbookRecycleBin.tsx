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
  ChevronDown,
  ChevronUp,
  ChevronLeft,
  ChevronRight,
  Layers,
} from 'lucide-react';
import { toast } from 'react-toastify';
import { Modal } from '../../../components/ui/Modal';
import { supabase } from '../../../lib/supabase/client';

interface LogbookRecycleBinProps {
  isOpen: boolean;
  onClose: () => void;
  onRestoreSuccess: () => void;
}

interface LogItem {
  id: string;
  timestamp: string;
  memberId: string | null;
  customerName: string;
  customerType: string;
  categoryOrPlan: string;
  amountPaid: number;
  deletedAt: string;
  receiptNumber?: string | null;
  memberIds?: string[];
  cardFee?: number | null;
  paymentMethod?: string | null;
}

interface LogGroupStack {
  key: string;
  isGroup: boolean;
  primaryTitle: string;
  subtitle: string;
  isCard: boolean;
  totalAmount: number;
  latestDeletedAt: string;
  items: LogItem[];
}

export const LogbookRecycleBin: React.FC<LogbookRecycleBinProps> = ({
  isOpen,
  onClose,
  onRestoreSuccess,
}) => {
  const [deletedLogs, setDeletedLogs] = useState<LogItem[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [countdown, setCountdown] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [expandedGroupKeys, setExpandedGroupKeys] = useState<Set<string>>(new Set());
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
        const mappedLogs: LogItem[] = data
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
            receiptNumber: att.receipt_number || null,
            memberIds: Array.isArray(att.member_ids) ? att.member_ids : [],
            cardFee: att.card_fee ? Number(att.card_fee) : null,
            paymentMethod: att.payment_method || null,
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
      setExpandedGroupKeys(new Set());
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

  // Filter logs by search query
  const filteredLogs = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return deletedLogs;
    return deletedLogs.filter(
      (l) =>
        String(l.id || '').toLowerCase().includes(q) ||
        String(l.customerName || '').toLowerCase().includes(q) ||
        String(l.customerType || '').toLowerCase().includes(q) ||
        String(l.categoryOrPlan || '').toLowerCase().includes(q) ||
        String(l.receiptNumber || '').toLowerCase().includes(q)
    );
  }, [deletedLogs, searchQuery]);

  // Group identical/same items together so that repetitive deletions form clean stacked cards
  const groupedStacks = useMemo(() => {
    const groupsMap = new Map<string, LogGroupStack>();

    filteredLogs.forEach((log) => {
      const isCard =
        log.customerType === 'Card' ||
        String(log.categoryOrPlan || '').toLowerCase().includes('card');

      // Group key resolution:
      // 1. Batch card purchase by receiptNumber
      // 2. Or identical card / plan name with same customer or consecutive deletion
      let groupKey = '';
      if (log.receiptNumber) {
        groupKey = `receipt-${log.receiptNumber}`;
      } else if (isCard) {
        groupKey = `card-${log.categoryOrPlan.toLowerCase()}`;
      } else {
        groupKey = `log-${log.customerName.toLowerCase().trim()}-${log.categoryOrPlan.toLowerCase()}`;
      }

      if (!groupsMap.has(groupKey)) {
        const primaryTitle = isCard
          ? log.categoryOrPlan || 'Physical Membership Card'
          : log.customerName;

        const subtitle = isCard
          ? log.receiptNumber
            ? `Receipt #${log.receiptNumber} • ${log.customerName}`
            : log.customerName
          : log.categoryOrPlan;

        groupsMap.set(groupKey, {
          key: groupKey,
          isGroup: false,
          primaryTitle,
          subtitle,
          isCard,
          totalAmount: 0,
          latestDeletedAt: log.deletedAt,
          items: [],
        });
      }

      const grp = groupsMap.get(groupKey)!;
      grp.items.push(log);
      grp.totalAmount += log.amountPaid;
      grp.isGroup = grp.items.length > 1;
      if (new Date(log.deletedAt).getTime() > new Date(grp.latestDeletedAt).getTime()) {
        grp.latestDeletedAt = log.deletedAt;
      }
    });

    return Array.from(groupsMap.values());
  }, [filteredLogs]);

  const totalPages = Math.max(1, Math.ceil(groupedStacks.length / itemsPerPage));
  const clampedPage = Math.min(currentPage, totalPages);

  const paginatedStacks = useMemo(() => {
    const startIdx = (clampedPage - 1) * itemsPerPage;
    return groupedStacks.slice(startIdx, startIdx + itemsPerPage);
  }, [groupedStacks, clampedPage, itemsPerPage]);

  const checkDuplicateActiveAttendance = async (log: LogItem): Promise<boolean> => {
    const isCard =
      log.customerType === 'Card' ||
      String(log.categoryOrPlan || '').toLowerCase().includes('card');

    // For Card transactions, check if the member already has an active PAID card from a DIFFERENT transaction
    if (isCard) {
      const targetMemberIds: string[] = [];
      if (log.memberId) targetMemberIds.push(log.memberId);
      if (log.memberIds && log.memberIds.length > 0) {
        log.memberIds.forEach((id) => targetMemberIds.push(id));
      }

      if (log.receiptNumber) {
        const { data: rcpt } = await supabase
          .from('receipts')
          .select('member_ids, member_id')
          .eq('id', log.receiptNumber)
          .maybeSingle();
        if (rcpt) {
          if (rcpt.member_id) targetMemberIds.push(rcpt.member_id);
          if (Array.isArray(rcpt.member_ids)) {
            rcpt.member_ids.forEach((id: string) => targetMemberIds.push(id));
          }
        }
      }

      const uniqueTargets = Array.from(new Set(targetMemberIds)).filter(Boolean);
      if (uniqueTargets.length === 0) return false;

      // Check cards table: ONLY a conflict if member already has another active PAID card with a DIFFERENT receipt
      let cardQuery = supabase
        .from('cards')
        .select('id, status, payment_status, member_id, receipt_number')
        .in('member_id', uniqueTargets)
        .eq('status', 'Active')
        .eq('payment_status', 'PAID');

      if (log.receiptNumber) {
        cardQuery = cardQuery.neq('receipt_number', log.receiptNumber);
      }

      const { data: conflictingCards } = await cardQuery;
      return !!(conflictingCards && conflictingCards.length > 0);
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

  const handleBulkRestore = async (selectedList: LogItem[]) => {
    if (selectedList.length === 0) return;
    setLoading(true);
    try {
      const duplicates: LogItem[] = [];
      const validToRestore: LogItem[] = [];

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

      const restoreTxIds = validToRestore.map((l) => l.id);

      // 1. Restore Attendance Table Entries
      const { error: attError } = await supabase
        .from('attendance')
        .update({ deleted_at: null, deleted_by: null })
        .in('id', restoreTxIds);

      if (attError) throw attError;

      // 2. Reactivate Member Cards in cards Table (and fallback member_cards)
      const allCardMemberIds: string[] = [];
      const allReceiptNumbers: string[] = [];

      validToRestore.forEach((l) => {
        const isCardTx =
          l.customerType === 'Card' ||
          String(l.categoryOrPlan || '').toLowerCase().includes('card');

        if (isCardTx) {
          if (l.memberId) allCardMemberIds.push(l.memberId);
          if (Array.isArray(l.memberIds) && l.memberIds.length > 0) {
            l.memberIds.forEach((mid) => allCardMemberIds.push(mid));
          }
          if (l.receiptNumber) allReceiptNumbers.push(l.receiptNumber);
        }
      });

      const uniqueReceipts = Array.from(new Set(allReceiptNumbers)).filter(Boolean);

      // Query receipts and cards for all member IDs belonging to these receipts
      if (uniqueReceipts.length > 0) {
        const [rcptRes, cardRes] = await Promise.allSettled([
          supabase
            .from('receipts')
            .select('id, member_ids, member_id')
            .in('id', uniqueReceipts),
          supabase
            .from('cards')
            .select('member_id, receipt_number')
            .in('receipt_number', uniqueReceipts),
        ]);

        if (rcptRes.status === 'fulfilled' && rcptRes.value.data) {
          rcptRes.value.data.forEach((r: any) => {
            if (r.member_id) allCardMemberIds.push(r.member_id);
            if (Array.isArray(r.member_ids)) {
              r.member_ids.forEach((id: string) => allCardMemberIds.push(id));
            }
          });
        }

        if (cardRes.status === 'fulfilled' && cardRes.value.data) {
          cardRes.value.data.forEach((c: any) => {
            if (c.member_id) allCardMemberIds.push(c.member_id);
          });
        }

        // Restore receipt payment_status
        await supabase
          .from('receipts')
          .update({
            payment_status: 'Paid',
            updated_at: new Date().toISOString(),
          })
          .in('id', uniqueReceipts);

        // Update cards by receipt_number
        await supabase
          .from('cards')
          .update({
            status: 'Active',
            payment_status: 'PAID',
            claim_status: 'UNCLAIMED',
            updated_at: new Date().toISOString(),
          })
          .in('receipt_number', uniqueReceipts);
      }

      const uniqueMemberIds = Array.from(new Set(allCardMemberIds)).filter(Boolean);

      if (uniqueMemberIds.length > 0) {
        // Resolve both members.id and members.member_id
        const { data: memberRows } = await supabase
          .from('members')
          .select('id, member_id')
          .or(
            `member_id.in.(${uniqueMemberIds.map((id) => `"${id}"`).join(',')}),id.in.(${uniqueMemberIds.map((id) => `"${id}"`).join(',')})`
          );

        const allPossibleIds = Array.from(
          new Set([
            ...uniqueMemberIds,
            ...(memberRows || []).map((m: any) => m.id),
            ...(memberRows || []).map((m: any) => m.member_id),
          ])
        ).filter(Boolean);

        // Update cards table (the source of truth)
        const { error: cardsErr } = await supabase
          .from('cards')
          .update({
            status: 'Active',
            payment_status: 'PAID',
            claim_status: 'UNCLAIMED',
            updated_at: new Date().toISOString(),
          })
          .in('member_id', allPossibleIds);

        if (cardsErr) {
          console.warn('Error updating cards table:', cardsErr);
        }

        // Also update member_cards table for backward compatibility
        await supabase
          .from('member_cards')
          .update({
            status: 'Active',
            payment_status: 'PAID',
            deleted_at: null,
          })
          .in('member_id', allPossibleIds);
      }

      // Notify other views (MembersList, MemberProfileView, etc.) to refresh
      window.dispatchEvent(new CustomEvent('member-refresh'));
      window.dispatchEvent(new CustomEvent('cards-refresh'));

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

  const toggleGroupExpansion = (groupKey: string) => {
    setExpandedGroupKeys((prev) => {
      const next = new Set(prev);
      if (next.has(groupKey)) {
        next.delete(groupKey);
      } else {
        next.add(groupKey);
      }
      return next;
    });
  };

  const isGroupFullySelected = (stack: LogGroupStack) => {
    return (
      stack.items.length > 0 &&
      stack.items.every((item) => selectedIds.includes(item.id))
    );
  };

  const toggleGroupSelection = (stack: LogGroupStack) => {
    const itemIds = stack.items.map((i) => i.id);
    const fullySelected = isGroupFullySelected(stack);

    if (fullySelected) {
      setSelectedIds((prev) => prev.filter((id) => !itemIds.includes(id)));
    } else {
      setSelectedIds((prev) => Array.from(new Set([...prev, ...itemIds])));
    }
  };

  const toggleItemSelection = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]
    );
  };

  const handleSelectAllPage = () => {
    const pageItemIds = paginatedStacks.flatMap((s) => s.items.map((i) => i.id));
    const allSelected =
      pageItemIds.length > 0 && pageItemIds.every((id) => selectedIds.includes(id));

    if (allSelected) {
      setSelectedIds((prev) => prev.filter((id) => !pageItemIds.includes(id)));
    } else {
      setSelectedIds((prev) => Array.from(new Set([...prev, ...pageItemIds])));
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
            24 hours before automatic purging. Identical items are automatically stacked.
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
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 text-[10px] font-bold"
            >
              CLEAR
            </button>
          )}
        </div>

        {groupedStacks.length > 0 && (
          <div className="flex justify-between items-center bg-slate-100 dark:bg-zinc-900 border border-(--border-color) rounded-xl px-3 py-2 text-[10px] font-bold text-slate-500 uppercase tracking-wider select-none">
            <button
              type="button"
              onClick={handleSelectAllPage}
              disabled={loading}
              className="flex items-center gap-2 cursor-pointer hover:opacity-85 text-left disabled:opacity-50"
            >
              <input
                type="checkbox"
                readOnly
                checked={
                  paginatedStacks.flatMap((s) => s.items).length > 0 &&
                  paginatedStacks
                    .flatMap((s) => s.items)
                    .every((i) => selectedIds.includes(i.id))
                }
                className="w-3.5 h-3.5 rounded text-blue-600 cursor-pointer accent-(--color-primary)"
              />
              <span>Select All on Page</span>
            </button>
            <span>{selectedIds.length} Selected</span>
          </div>
        )}

        <div className="space-y-3">
          {paginatedStacks.length > 0 ? (
            paginatedStacks.map((stack) => {
              const groupSelected = isGroupFullySelected(stack);
              const isExpanded = expandedGroupKeys.has(stack.key);

              if (stack.isGroup) {
                // Stacked Group Card for multiple identical items (e.g. 4 cards for 4 members)
                return (
                  <div
                    key={stack.key}
                    className="border border-(--border-color) bg-slate-50 dark:bg-zinc-900/90 rounded-2xl overflow-hidden transition-all shadow-xs"
                  >
                    {/* Main Group Header Row */}
                    <div
                      onClick={() => toggleGroupSelection(stack)}
                      className={`p-3.5 flex items-center justify-between gap-3 cursor-pointer transition-colors ${
                        groupSelected
                          ? 'bg-blue-500/10'
                          : 'hover:bg-slate-100 dark:hover:bg-zinc-800/60'
                      }`}
                    >
                      <div className="flex items-center gap-3 min-w-0 flex-1">
                        <input
                          type="checkbox"
                          checked={groupSelected}
                          onChange={() => {}}
                          className="w-4 h-4 rounded text-blue-600 cursor-pointer accent-(--color-primary)"
                        />
                        <div className="min-w-0 flex-1 text-left font-mono">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="font-bold text-[11px] text-(--color-text) truncate">
                              {stack.primaryTitle}
                            </span>
                            <span className="px-2 py-0.5 bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/30 rounded-full text-[9px] font-bold uppercase flex items-center gap-1">
                              <Layers className="w-2.5 h-2.5" />
                              <span>×{stack.items.length} items</span>
                            </span>
                            {stack.isCard && (
                              <span className="px-1.5 py-0.5 bg-emerald-500/10 text-emerald-600 border border-emerald-500/30 rounded text-[8px] font-bold uppercase flex items-center gap-0.5">
                                <CreditCard className="w-2.5 h-2.5" />
                                Card
                              </span>
                            )}
                          </div>
                          <div className="text-[10px] text-slate-400 mt-1 flex items-center gap-2 flex-wrap">
                            <span>{stack.subtitle}</span>
                            {stack.totalAmount > 0 && (
                              <span className="font-bold text-slate-600 dark:text-slate-300">
                                Total: ₱{stack.totalAmount.toFixed(2)}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          type="button"
                          disabled={loading}
                          onClick={(e) => {
                            e.stopPropagation();
                            handleBulkRestore(stack.items);
                          }}
                          className="py-1.5 px-2.5 bg-emerald-500 hover:bg-emerald-600 text-white rounded-lg font-heading text-[8px] tracking-wider uppercase font-bold cursor-pointer disabled:opacity-50 transition-all shadow-xs"
                        >
                          Restore All ({stack.items.length})
                        </button>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleGroupExpansion(stack.key);
                          }}
                          className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-lg hover:bg-slate-200/60 dark:hover:bg-zinc-800 cursor-pointer"
                          aria-label="Toggle details"
                        >
                          {isExpanded ? (
                            <ChevronUp className="w-4 h-4" />
                          ) : (
                            <ChevronDown className="w-4 h-4" />
                          )}
                        </button>
                      </div>
                    </div>

                    {/* Accordion Sub-Items List */}
                    {isExpanded && (
                      <div className="border-t border-(--border-color) bg-white/50 dark:bg-zinc-950/40 divide-y divide-(--border-color)">
                        {stack.items.map((subItem) => {
                          const subSelected = selectedIds.includes(subItem.id);
                          return (
                            <div
                              key={subItem.id}
                              onClick={() => toggleItemSelection(subItem.id)}
                              className={`p-2.5 pl-9 flex items-center justify-between gap-3 cursor-pointer text-[10px] transition-colors ${
                                subSelected
                                  ? 'bg-blue-500/10'
                                  : 'hover:bg-slate-50 dark:hover:bg-zinc-900/50'
                              }`}
                            >
                              <div className="flex items-center gap-2.5 min-w-0">
                                <input
                                  type="checkbox"
                                  checked={subSelected}
                                  onChange={() => {}}
                                  className="w-3.5 h-3.5 rounded text-blue-600 cursor-pointer accent-(--color-primary)"
                                />
                                <div className="min-w-0 text-left font-mono">
                                  <span className="font-semibold text-slate-800 dark:text-slate-200 block truncate">
                                    {subItem.customerName}
                                  </span>
                                  <span className="text-[9px] text-slate-400">
                                    {subItem.categoryOrPlan}
                                    {subItem.amountPaid > 0 && ` • ₱${subItem.amountPaid.toFixed(2)}`}
                                  </span>
                                </div>
                              </div>
                              <button
                                type="button"
                                disabled={loading}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleBulkRestore([subItem]);
                                }}
                                className="py-1 px-2 bg-emerald-500/80 hover:bg-emerald-600 text-white rounded font-heading text-[8px] tracking-wider uppercase font-bold cursor-pointer disabled:opacity-50"
                              >
                                Restore
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              }

              // Single Record (No Grouping Needed)
              const tx = stack.items[0];
              const isSelected = selectedIds.includes(tx.id);

              return (
                <div key={tx.id} className="space-y-1.5 animate-fade-in">
                  <div
                    onClick={() => toggleItemSelection(tx.id)}
                    className={`p-3 border rounded-xl flex items-center justify-between gap-3 cursor-pointer transition-all ${
                      isSelected
                        ? 'bg-blue-500/10 border-blue-500'
                        : 'bg-slate-50 hover:bg-slate-100 dark:bg-zinc-900 border-(--border-color)'
                    }`}
                  >
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => {}}
                        className="w-4.5 h-4.5 rounded text-blue-600 cursor-pointer accent-(--color-primary)"
                      />
                      <div className="min-w-0 text-left font-mono flex-1">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="font-bold block text-[11px] text-(--color-text) truncate">
                            {tx.customerName}
                          </span>
                          {stack.isCard && (
                            <span className="px-1.5 py-0.2 bg-blue-500/10 text-blue-600 border border-blue-500/30 rounded text-[8px] font-bold uppercase flex items-center gap-0.5">
                              <CreditCard className="w-2.5 h-2.5" />
                              Card
                            </span>
                          )}
                        </div>
                        <span className="text-[10px] text-slate-400 mt-0.5 block">
                          {tx.categoryOrPlan}
                          {tx.amountPaid > 0 && ` • ₱${tx.amountPaid.toFixed(2)}`}
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
                      className="py-1.5 px-3 bg-emerald-500 hover:bg-emerald-600 text-white rounded-lg font-heading text-[8px] tracking-wider uppercase font-bold cursor-pointer disabled:opacity-50 shrink-0"
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

        {/* Pagination Controls */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between pt-2 border-t border-(--border-color) text-[11px] font-bold select-none">
            <button
              type="button"
              disabled={clampedPage <= 1 || loading}
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              className="px-3 py-1.5 rounded-lg border border-(--border-color) bg-slate-100 hover:bg-slate-200 dark:bg-zinc-900 dark:hover:bg-zinc-800 disabled:opacity-40 flex items-center gap-1 cursor-pointer"
            >
              <ChevronLeft className="w-3.5 h-3.5" />
              <span>Prev</span>
            </button>
            <span className="text-slate-500 font-mono text-[10px]">
              Page {clampedPage} of {totalPages}
            </span>
            <button
              type="button"
              disabled={clampedPage >= totalPages || loading}
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              className="px-3 py-1.5 rounded-lg border border-(--border-color) bg-slate-100 hover:bg-slate-200 dark:bg-zinc-900 dark:hover:bg-zinc-800 disabled:opacity-40 flex items-center gap-1 cursor-pointer"
            >
              <span>Next</span>
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

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
