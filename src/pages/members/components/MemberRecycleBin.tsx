// src/pages/members/components/MemberRecycleBin.tsx

import React, { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import {
  X,
  RotateCcw,
  Search,
  AlertCircle,
  Users,
  ChevronLeft,
  ChevronRight,
  CheckSquare,
  Square,
  ChevronDown,
  ChevronUp,
  Layers,
} from 'lucide-react';
import { format } from 'date-fns';
import { toast } from 'react-toastify';
import { AnimatePresence, motion } from 'framer-motion';
import type { Member } from '../../../types/members';
import { memberService } from '../memberService';

interface DeletedMember extends Member {
  deleted_at?: string | null;
  deleted_by?: string | null;
  delete_reason?: string | null;
}

interface MemberRecycleBinProps {
  isOpen: boolean;
  onClose: () => void;
  onRestoreSuccess: () => void;
}

const CONSECUTIVE_GAP_LIMIT_MS = 1 * 60 * 1000;

export const MemberRecycleBin: React.FC<MemberRecycleBinProps> = ({
  isOpen,
  onClose,
  onRestoreSuccess,
}) => {
  const [deletedItems, setDeletedItems] = useState<DeletedMember[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [expandedStackKeys, setExpandedStackKeys] = useState<Set<string>>(new Set());
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 5;

  const fetchDeletedMembers = async () => {
    setLoading(true);
    try {
      const data = await memberService.getArchived();
      setDeletedItems(data || []);
    } catch (err: any) {
      console.error(err);
      toast.error(
        err.message || 'Failed to load archived members from Recycle Bin.'
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchDeletedMembers();
      setSelectedIds([]);
      setCurrentPage(1);
      setSearchQuery('');
    }
  }, [isOpen]);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery]);

  const getDaysRemaining = (deletedAt?: string | null) => {
    if (!deletedAt) return null;
    const deletedTimestamp = new Date(deletedAt).getTime();
    const purgeDate = new Date(deletedTimestamp + 30 * 24 * 60 * 60 * 1000);
    const now = new Date();
    const diffMs = purgeDate.getTime() - now.getTime();

    if (diffMs <= 0) return 'Purging...';
    const diffDays = Math.ceil(diffMs / (24 * 60 * 60 * 1000));
    return `${diffDays}d left`;
  };

  const filteredItems = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    return deletedItems.filter((item) => {
      return (
        item.id?.toLowerCase().includes(q) ||
        item.full_name?.toLowerCase().includes(q) ||
        item.member_id?.toLowerCase().includes(q)
      );
    });
  }, [deletedItems, searchQuery]);

  const groupedItems = useMemo(() => {
    let currentGroupId = 0;
    let prevTime: number | null = null;

    return filteredItems.map((item, idx) => {
      const currentTime = item.deleted_at
        ? new Date(item.deleted_at).getTime()
        : 0;

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
        .map((t) => new Date(t!).getTime());

      if (times.length > 0) {
        const maxTime = Math.max(...times);
        const minTime = Math.min(...times);
        const formatTime = (ms: number) =>
          format(new Date(ms), 'MMM d, hh:mm a');

        if (formatTime(maxTime) === formatTime(minTime)) {
          meta[groupId].label = `Batch at ${formatTime(maxTime)}`;
        } else {
          meta[groupId].label =
            `Batch: ${formatTime(minTime)} - ${formatTime(maxTime)}`;
        }
      } else {
        meta[groupId].label = 'Consecutive Batch';
      }
    });

    return meta;
  }, [groupedItems]);

  // Group duplicate or identical deleted members within batches so repeated deletions form clean expandable stacks
  const stackedMembers = useMemo(() => {
    const map = new Map<
      string,
      {
        key: string;
        groupId: string;
        full_name: string;
        member_id: string;
        phone: string | null;
        avatar_url: string | null;
        isGroup: boolean;
        latestDeletedAt: string;
        items: any[];
      }
    >();

    groupedItems.forEach((m) => {
      const name = (m.full_name || 'Member').trim();
      const key = `${m.groupId}_${name.toLowerCase()}`;
      if (!map.has(key)) {
        map.set(key, {
          key,
          groupId: m.groupId,
          full_name: name,
          member_id: m.member_id,
          phone: m.phone || null,
          avatar_url: m.avatar_url || null,
          isGroup: false,
          latestDeletedAt: m.deleted_at || new Date().toISOString(),
          items: [],
        });
      }
      const stack = map.get(key)!;
      stack.items.push(m);
      stack.isGroup = stack.items.length > 1;
      if (
        m.deleted_at &&
        new Date(m.deleted_at).getTime() >
          new Date(stack.latestDeletedAt).getTime()
      ) {
        stack.latestDeletedAt = m.deleted_at;
      }
    });

    return Array.from(map.values());
  }, [groupedItems]);

  const totalItems = stackedMembers.length;
  const totalPages = Math.ceil(totalItems / itemsPerPage) || 1;
  const clampedPage = Math.min(Math.max(currentPage, 1), totalPages);

  const paginatedStacks = useMemo(() => {
    const startIdx = (clampedPage - 1) * itemsPerPage;
    return stackedMembers.slice(startIdx, startIdx + itemsPerPage);
  }, [stackedMembers, clampedPage]);

  const toggleStackExpansion = (key: string) => {
    setExpandedStackKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const isStackFullySelected = (stack: any) => {
    if (stack.items.length === 0) return false;
    return stack.items.every((i: any) => selectedIds.includes(i.id));
  };

  const handleStackSelect = (stack: any) => {
    const allSelected = isStackFullySelected(stack);
    const ids = stack.items.map((i: any) => i.id);

    if (allSelected) {
      setSelectedIds((prev) => prev.filter((id) => !ids.includes(id)));
    } else {
      setSelectedIds((prev) => Array.from(new Set([...prev, ...ids])));
    }
  };

  const startIndex = (clampedPage - 1) * itemsPerPage;

  const handleBulkRestore = async (selectedList: DeletedMember[]) => {
    if (selectedList.length === 0) return;
    setLoading(true);

    try {
      for (const member of selectedList) {
        await memberService.restore(member.id, 'Admin Staff');
      }

      setSelectedIds([]);
      onRestoreSuccess();
      toast.success(
        `Successfully restored ${selectedList.length} member(s) back to your directory.`
      );
      await fetchDeletedMembers();
    } catch (err: any) {
      console.error('Error executing database restoration:', err);
      toast.error(
        err.message || 'Failed to complete member profile restoration.'
      );
    } finally {
      setLoading(false);
    }
  };

  const handleRowSelect = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const isGroupFullySelected = (groupId: string) => {
    const groupItemIds = groupMeta[groupId]?.ids || [];
    if (groupItemIds.length === 0) return false;
    return groupItemIds.every((id) => selectedIds.includes(id));
  };

  const handleGroupSelect = (groupId: string) => {
    const groupItemIds = groupMeta[groupId]?.ids || [];
    const allSelected = isGroupFullySelected(groupId);

    if (allSelected) {
      setSelectedIds((prev) => prev.filter((id) => !groupItemIds.includes(id)));
    } else {
      setSelectedIds((prev) => Array.from(new Set([...prev, ...groupItemIds])));
    }
  };

  const handleToggleSelectAll = () => {
    const currentPageIds = paginatedStacks
      .flatMap((s) => s.items)
      .map((t: any) => t.id);
    const allSelectedOnPage =
      currentPageIds.length > 0 &&
      currentPageIds.every((id) => selectedIds.includes(id));

    if (allSelectedOnPage) {
      setSelectedIds((prev) =>
        prev.filter((id) => !currentPageIds.includes(id))
      );
    } else {
      setSelectedIds((prev) =>
        Array.from(new Set([...prev, ...currentPageIds]))
      );
    }
  };

  const isSelectionActive = selectedIds.length > 0;
  let lastGroupTracker: string | null = null;

  const currentPageItems = paginatedStacks.flatMap((s) => s.items);
  const isAllOnPageSelected =
    currentPageItems.length > 0 &&
    currentPageItems.every((t: any) => selectedIds.includes(t.id));

  if (!isOpen) return null;

  return createPortal(
    <div className="fixed inset-0 z-2000 flex items-center justify-center p-4 bg-black/75 backdrop-blur-md animate-fade-in font-body text-xs text-(--color-text)">
      <div className="relative bg-(--bg-card) border border-(--border-color) rounded-3xl w-full max-w-md shadow-2xl p-6 space-y-4 max-h-[85vh] overflow-y-auto">
        <div className="flex justify-between items-center border-b border-slate-200 dark:border-white/5 pb-3">
          <h3 className="font-heading tracking-widest uppercase">
            Member Recycle Bin
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-xl bg-(--bg-page) border border-(--border-color) text-slate-400 hover:text-(--color-text) cursor-pointer"
          >
            <X className="w-4.5 h-4.5" />
          </button>
        </div>

        <div className="space-y-4 pt-2">
          <div className="p-3 bg-rose-500/10 border border-rose-500/20 rounded-xl flex items-start gap-2.5 text-[11px] leading-relaxed text-rose-600 dark:text-rose-400 font-semibold">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-rose-500" />
            <span>
              <strong>Caution:</strong> Restorable profiles are kept for up to
              30 days. Accounts here are locked and will be permanently deleted
              at 12:00 AM Manila Time.
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
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-655 dark:hover:text-slate-205 text-xs font-bold border-none bg-transparent cursor-pointer animate-fade-in"
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
                className="flex items-center gap-2 cursor-pointer hover:opacity-85 text-left disabled:opacity-50 border-none bg-transparent font-bold text-slate-500"
              >
                {isAllOnPageSelected ? (
                  <CheckSquare className="w-4 h-4 text-(--color-primary-light) shrink-0" />
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
                  <div
                    key={i}
                    className="p-3 bg-slate-100/50 dark:bg-zinc-900/50 border border-(--border-color) rounded-xl animate-pulse flex items-center justify-between gap-3"
                  >
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
            ) : paginatedStacks.length > 0 ? (
              paginatedStacks.map((stack) => {
                const showGroupHeading = stack.groupId !== lastGroupTracker;
                lastGroupTracker = stack.groupId;
                const isExpanded = expandedStackKeys.has(stack.key);
                const stackSelected = isStackFullySelected(stack);
                const daysRemaining = getDaysRemaining(stack.latestDeletedAt);

                return (
                  <div key={stack.key} className="space-y-1.5 animate-fade-in">
                    {showGroupHeading && (
                      <div className="flex items-center justify-between border-b border-(--border-color) pt-4 pb-1.5 select-none">
                        <button
                          type="button"
                          disabled={loading}
                          onClick={() => handleGroupSelect(stack.groupId)}
                          className="flex items-center gap-2 cursor-pointer hover:opacity-80 text-left disabled:opacity-50 font-bold border-none bg-transparent"
                        >
                          {isGroupFullySelected(stack.groupId) ? (
                            <CheckSquare className="w-4 h-4 text-(--color-primary-light) shrink-0" />
                          ) : (
                            <Square className="w-4 h-4 text-slate-400 dark:text-zinc-600 shrink-0" />
                          )}
                          <span className="text-[9px] font-heading tracking-widest text-(--color-primary-light) uppercase">
                            {groupMeta[stack.groupId]?.label}
                          </span>
                        </button>
                        <span className="text-[9px] text-slate-400 font-medium font-mono">
                          ({groupMeta[stack.groupId]?.ids.length} item
                          {groupMeta[stack.groupId]?.ids.length !== 1 && 's'})
                        </span>
                      </div>
                    )}

                    {stack.isGroup ? (
                      /* Grouped Card for multiple identical/repeated deleted members */
                      <div className="border border-(--border-color) bg-(--bg-page) rounded-2xl overflow-hidden transition-all shadow-xs">
                        <div
                          onClick={() => handleStackSelect(stack)}
                          className={`p-3.5 flex items-center justify-between gap-3 cursor-pointer transition-colors ${
                            stackSelected
                              ? 'bg-blue-500/10'
                              : 'hover:bg-slate-100 dark:hover:bg-zinc-800/60'
                          }`}
                        >
                          <div className="flex items-center gap-3 min-w-0 flex-1">
                            <input
                              type="checkbox"
                              checked={stackSelected}
                              onChange={() => {}}
                              className="w-4 h-4 rounded text-blue-600 cursor-pointer accent-(--color-primary)"
                            />
                            <div className="min-w-0 text-left flex items-center gap-3 flex-1">
                              {stack.avatar_url ? (
                                <img
                                  src={stack.avatar_url}
                                  alt={stack.full_name}
                                  className="w-10 h-10 rounded-lg object-cover border border-(--border-color) shrink-0 grayscale opacity-70"
                                />
                              ) : (
                                <div className="w-10 h-10 rounded-lg bg-(--bg-page) border border-(--border-color) flex items-center justify-center text-slate-455 font-bold text-xs shrink-0 select-none uppercase">
                                  {(stack.full_name || 'M')[0]}
                                </div>
                              )}
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  <span className="font-bold text-[11px] text-(--color-text) truncate">
                                    {stack.full_name}
                                  </span>
                                  <span className="px-2 py-0.5 bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/30 rounded-full text-[9px] font-bold uppercase flex items-center gap-1">
                                    <Layers className="w-2.5 h-2.5" />
                                    <span>×{stack.items.length} records</span>
                                  </span>
                                </div>
                                <div className="text-[10px] text-slate-400 font-mono mt-0.5">
                                  {stack.member_id} • {stack.phone || 'No phone'}
                                </div>
                              </div>
                            </div>
                          </div>

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
                              onClick={() => handleBulkRestore(stack.items)}
                              className="py-1.5 px-2.5 bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50 text-white rounded-lg font-heading text-[8px] tracking-wider uppercase cursor-pointer font-bold shrink-0 shadow-sm border-none"
                            >
                              Restore All ({stack.items.length})
                            </button>
                            <button
                              type="button"
                              onClick={() => toggleStackExpansion(stack.key)}
                              className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-lg hover:bg-slate-200/60 dark:hover:bg-zinc-800 cursor-pointer"
                            >
                              {isExpanded ? (
                                <ChevronUp className="w-4 h-4" />
                              ) : (
                                <ChevronDown className="w-4 h-4" />
                              )}
                            </button>
                          </div>
                        </div>

                        {/* Accordion Sub-Items */}
                        {isExpanded && (
                          <div className="border-t border-(--border-color) bg-white/50 dark:bg-zinc-950/40 divide-y divide-(--border-color)">
                            {stack.items.map((subItem: any) => {
                              const isSubSelected = selectedIds.includes(
                                subItem.id
                              );
                              return (
                                <div
                                  key={subItem.id}
                                  onClick={() =>
                                    !loading && handleRowSelect(subItem.id)
                                  }
                                  className={`p-2.5 pl-8 flex items-center justify-between gap-3 cursor-pointer text-[10px] transition-colors ${
                                    isSubSelected
                                      ? 'bg-blue-500/10'
                                      : 'hover:bg-slate-50 dark:hover:bg-zinc-900/50'
                                  }`}
                                >
                                  <div className="flex items-center gap-2.5 min-w-0 flex-1">
                                    <input
                                      type="checkbox"
                                      disabled={loading}
                                      checked={isSubSelected}
                                      onChange={() =>
                                        handleRowSelect(subItem.id)
                                      }
                                      className="w-3.5 h-3.5 rounded text-blue-600 cursor-pointer accent-(--color-primary)"
                                    />
                                    <div className="min-w-0 text-left font-mono">
                                      <span className="font-semibold text-slate-800 dark:text-slate-200 block truncate">
                                        Member ID: {subItem.member_id} • System ID:{' '}
                                        {subItem.id.slice(0, 8)}...
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
                    ) : (
                      /* Single Member Item */
                      (() => {
                        const item = stack.items[0];
                        const isSelected = selectedIds.includes(item.id);

                        return (
                          <div
                            onClick={() => !loading && handleRowSelect(item.id)}
                            className={`p-3 border rounded-xl flex items-center justify-between gap-3 cursor-pointer transition-all ${
                              isSelected
                                ? 'bg-blue-500/10 border-blue-500'
                                : 'bg-(--bg-page) hover:bg-slate-100 dark:hover:bg-zinc-800 border-(--border-color)'
                            } ${loading ? 'opacity-60 cursor-not-allowed' : ''}`}
                          >
                            <div className="flex items-center gap-3 min-w-0">
                              <div
                                className="shrink-0"
                                onClick={(e) => e.stopPropagation()}
                              >
                                <input
                                  type="checkbox"
                                  disabled={loading}
                                  checked={isSelected}
                                  onChange={() => handleRowSelect(item.id)}
                                  className="w-4.5 h-4.5 rounded border-slate-300 dark:border-white/10 text-blue-600 cursor-pointer accent-(--color-primary)"
                                />
                              </div>
                              <div className="min-w-0 text-left flex items-center gap-3">
                                {item.avatar_url ? (
                                  <img
                                    src={item.avatar_url}
                                    alt={item.full_name}
                                    className="w-10 h-10 rounded-lg object-cover border border-(--border-color) shrink-0 grayscale opacity-70"
                                  />
                                ) : (
                                  <div className="w-10 h-10 rounded-lg bg-(--bg-page) border border-(--border-color) flex items-center justify-center text-slate-455 font-bold text-xs shrink-0 select-none uppercase">
                                    {(item.full_name || 'M')[0]}
                                  </div>
                                )}
                                <div className="min-w-0">
                                  <span className="font-bold block text-[11px] text-(--color-text) truncate">
                                    {item.full_name}
                                  </span>
                                  <span className="text-[10px] text-slate-400 font-mono mt-0.5 block leading-none">
                                    {item.member_id} • {item.phone || 'No phone'}
                                  </span>
                                </div>
                              </div>
                            </div>

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
                                className="py-1.5 px-3 bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50 text-white rounded-lg font-heading text-[8px] tracking-wider uppercase cursor-pointer font-bold shrink-0 shadow-sm border-none"
                              >
                                Restore
                              </button>
                            </div>
                          </div>
                        );
                      })()
                    )}
                  </div>
                );
              })
            ) : (
              <div className="text-center py-12 text-slate-400 border border-dashed border-(--border-color) rounded-2xl flex flex-col items-center justify-center space-y-3">
                <Users className="w-8 h-8 animate-pulse text-slate-505" />
                <div>
                  <h4 className="font-heading text-sm uppercase tracking-widest text-(--color-text)">
                    No deletions found
                  </h4>
                  <p className="text-[10px] font-sans mt-0.5 text-slate-505">
                    Recycle Bin is completely clear.
                  </p>
                </div>
              </div>
            )}
          </div>

          {totalItems > 0 && totalPages > 1 && (
            <div className="flex flex-col sm:flex-row items-center justify-between gap-3 mt-4 pt-2 text-[10px] font-body">
              <span className="text-slate-500">
                Showing{' '}
                <span className="font-semibold text-(--color-text)">
                  {startIndex + 1}
                </span>{' '}
                to{' '}
                <span className="font-semibold text-(--color-text)">
                  {Math.min(startIndex + itemsPerPage, totalItems)}
                </span>{' '}
                of{' '}
                <span className="font-semibold text-(--color-text)">
                  {totalItems}
                </span>{' '}
                entries
              </span>

              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() =>
                    setCurrentPage((prev) => Math.max(prev - 1, 1))
                  }
                  disabled={clampedPage === 1 || loading}
                  className="p-1 border border-(--border-color) rounded-lg hover:bg-slate-100 dark:hover:bg-neutral-800 text-slate-700 dark:text-slate-300 disabled:opacity-40 disabled:pointer-events-none cursor-pointer inline-flex items-center justify-center h-7 w-7 bg-transparent"
                >
                  <ChevronLeft className="w-3.5 h-3.5" />
                </button>

                {Array.from({ length: totalPages }, (_, i) => i + 1).map(
                  (page) => (
                    <button
                      key={page}
                      type="button"
                      disabled={loading}
                      onClick={() => setCurrentPage(page)}
                      className={`h-7 w-7 rounded-lg font-mono font-bold transition-all cursor-pointer text-[10px] disabled:opacity-50 border-none ${
                        clampedPage === page
                          ? 'bg-[#1b365d] dark:bg-[#bf0202] text-white'
                          : 'border border-(--border-color) text-slate-700 dark:text-slate-355 hover:bg-slate-100 dark:hover:bg-neutral-800 bg-transparent'
                      }`}
                    >
                      {page}
                    </button>
                  )
                )}

                <button
                  type="button"
                  onClick={() =>
                    setCurrentPage((prev) => Math.min(prev + 1, totalPages))
                  }
                  disabled={clampedPage === totalPages || loading}
                  className="p-1 border border-(--border-color) rounded-lg hover:bg-slate-100 dark:hover:bg-neutral-800 text-slate-700 dark:text-slate-300 disabled:opacity-40 disabled:pointer-events-none cursor-pointer inline-flex items-center justify-center h-7 w-7 bg-transparent"
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
                  onClick={() =>
                    handleBulkRestore(
                      deletedItems.filter((t) => selectedIds.includes(t.id))
                    )
                  }
                  className="flex-1 py-2.5 bg-emerald-500 hover:bg-emerald-600 text-white rounded-xl text-[10px] font-heading tracking-widest uppercase cursor-pointer transition-all flex items-center justify-center gap-1.5 shadow-md font-black disabled:opacity-50 border-none animate-fade-in"
                >
                  <RotateCcw className="w-4 h-4 shrink-0 animate-fade-in" />
                  <span>Restore Selected ({selectedIds.length})</span>
                </button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>,
    document.body
  );
};
