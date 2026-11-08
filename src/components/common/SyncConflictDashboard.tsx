// src/components/common/SyncConflictDashboard.tsx
import React, { useState, useEffect, useCallback } from 'react';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { useAuthStore } from '../../stores/authStore';
import { supabase } from '../../lib/supabase/client';
import type { DecryptedTransaction } from '../../lib/offlineVault';
import {
  AlertTriangle,
  Trash2,
  CheckCircle,
  Package,
  ShieldAlert,
  Loader2,
  Check,
  UserCheck
} from 'lucide-react';

export interface UnifiedConflictItem {
  id: string;
  source: 'cloud' | 'local';
  entityType: 'sale' | 'attendance';
  title: string;
  badgeLabel: string;
  firstTx: {
    id?: string;
    cashier: string;
    mainText: string;
    subText: string;
    amount: number;
    time?: string;
  };
  secondTx: {
    id?: string;
    cashier: string;
    mainText: string;
    subText: string;
    amount: number;
    time?: string;
  };
}

export interface SyncConflictDashboardProps {
  isOpen: boolean;
  onClose: () => void;
  conflicts: DecryptedTransaction[];
  onResolve: (id: string, action: 'keep_first' | 'keep_second' | 'drop_both') => Promise<void>;
  onResolveAllKeepOffline?: () => Promise<void>;
  onResolveAllDrop?: () => Promise<void>;
}

export const SyncConflictDashboard: React.FC<SyncConflictDashboardProps> = ({
  isOpen,
  onClose,
  conflicts: localVaultConflicts,
  onResolve,
}) => {
  const { user, profile } = useAuthStore();
  const isAdmin = profile?.role === 'admin' || user?.email?.toLowerCase().includes('admin');

  const [resolvingId, setResolvingId] = useState<string | null>(null);
  const [cloudConflicts, setCloudConflicts] = useState<any[]>([]);

  const [resolvedVaultIds, setResolvedVaultIds] = useState<Set<string>>(new Set());

  const fetchCloudConflicts = useCallback(async () => {
    if (typeof navigator !== 'undefined' && !navigator.onLine) return;
    try {
      const { data: activeSessionData } = await supabase
        .from('cash_sessions')
        .select('id')
        .eq('status', 'open')
        .limit(1)
        .maybeSingle();

      const activeSessionId = activeSessionData?.id || null;

      const { data: pendingData } = await supabase
        .from('sync_conflicts')
        .select('*')
        .eq('status', 'pending')
        .order('created_at', { ascending: false });

      if (pendingData) {
        // Automatically drop conflicts belonging to closed or passed sessions
        const activeList: any[] = [];
        for (const item of pendingData) {
          const firstSid = item.first_transaction?.cash_session_id || item.first_transaction?.cashSessionId;
          const secondSid =
            item.second_transaction?.cash_session_id ||
            item.second_transaction?.cashSessionId ||
            item.second_transaction?.payload?.cash_session_id;

          const isClosed =
            !activeSessionId ||
            (firstSid && firstSid !== activeSessionId) ||
            (secondSid && secondSid !== activeSessionId);

          if (isClosed) {
            await onResolve(item.id, 'drop_both');
          } else {
            activeList.push(item);
          }
        }
        setCloudConflicts(activeList);
      }

      // Check resolved conflicts to immediately remove them from the other user's view
      const { data: resolvedData } = await supabase
        .from('sync_conflicts')
        .select('second_transaction')
        .eq('status', 'resolved');

      if (resolvedData) {
        const resolvedIds = new Set<string>();
        resolvedData.forEach((r) => {
          if (r.second_transaction?.vault_id) {
            resolvedIds.add(r.second_transaction.vault_id);
          }
        });
        setResolvedVaultIds(resolvedIds);
      }
    } catch {
      // ignore offline fetch error
    }
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    fetchCloudConflicts();

    const channel = supabase
      .channel(`sync_conflicts_realtime_${Date.now()}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'sync_conflicts' },
        (payload: any) => {
          const rec = payload.new;
          if (rec && rec.status === 'resolved' && rec.second_transaction?.vault_id) {
            setResolvedVaultIds((prev) => new Set([...prev, rec.second_transaction.vault_id]));
            setCloudConflicts((prev) => prev.filter((c) => c.id !== rec.id));
          }
          fetchCloudConflicts();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [isOpen, fetchCloudConflicts]);

  // Merge cloud database conflicts with local vault conflicts
  const unifiedList: UnifiedConflictItem[] = React.useMemo(() => {
    const list: UnifiedConflictItem[] = [];
    const seenIds = new Set<string>();

    cloudConflicts.forEach((cc) => {
      seenIds.add(cc.id);
      if (cc.second_transaction?.vault_id) {
        seenIds.add(cc.second_transaction.vault_id);
      }

      const isAtt = cc.conflict_type === 'duplicate_attendance';

      if (isAtt) {
        const first = cc.first_transaction || {};
        const second = cc.second_transaction || {};
        const memberName = first.customer_name || second.customer_name || cc.product_name || 'Member';
        const memberTag = first.member_id ? ` (#${first.member_id})` : '';

        list.push({
          id: cc.id,
          source: 'cloud',
          entityType: 'attendance',
          title: `${memberName}${memberTag}`,
          badgeLabel: 'DUPLICATE ATTENDANCE COLLISION',
          firstTx: {
            id: first.id,
            cashier: first.cashier || 'SUPERADMIN',
            mainText: `Check-in: ${first.plan_name || 'Daily Entry'}`,
            subText: `Entry Fee: ₱${Number(first.entry_fee || 0).toFixed(2)}`,
            amount: Number(first.entry_fee || 0),
            time: first.created_at,
          },
          secondTx: {
            id: second.vault_id,
            cashier: second.cashier || 'Other Register',
            mainText: `Check-in: ${second.plan_name || 'Daily Entry'}`,
            subText: `Entry Fee: ₱${Number(second.entry_fee || 0).toFixed(2)}`,
            amount: Number(second.entry_fee || 0),
            time: second.created_at,
          },
        });
      } else {
        list.push({
          id: cc.id,
          source: 'cloud',
          entityType: 'sale',
          title: `Product: ${cc.product_name || 'Inventory Item'}`,
          badgeLabel: 'STOCK OVERDRAWN COLLISION',
          firstTx: {
            id: cc.first_transaction?.id,
            cashier: cc.first_transaction?.cashier || 'SUPERADMIN',
            mainText: `${cc.first_transaction?.quantity || 1}x ${cc.product_name || 'Item'}`,
            subText: `Total Sale: ₱${Number(cc.first_transaction?.total_amount || 0).toFixed(2)}`,
            amount: Number(cc.first_transaction?.total_amount || 0),
            time: cc.first_transaction?.created_at,
          },
          secondTx: {
            id: cc.second_transaction?.vault_id,
            cashier: cc.second_transaction?.cashier || 'Other Register',
            mainText: `${cc.second_transaction?.quantity || 1}x ${cc.product_name || 'Item'}`,
            subText: `Total Sale: ₱${Number(cc.second_transaction?.total_amount || 0).toFixed(2)}`,
            amount: Number(cc.second_transaction?.total_amount || 0),
            time: cc.second_transaction?.created_at,
          },
        });
      }
    });

    localVaultConflicts.forEach((lc) => {
      if (seenIds.has(lc.id) || resolvedVaultIds.has(lc.id)) return;

      const p = lc.payload || {};
      const cloud = lc.conflictCloudData || {};
      const isAtt = lc.type === 'attendance' || lc.conflictReason === 'duplicate_attendance';

      if (isAtt) {
        const memberName = p.customer_name || cloud.customer_name || 'Member';
        const memberTag = p.member_id ? ` (#${p.member_id})` : '';

        list.push({
          id: lc.id,
          source: 'local',
          entityType: 'attendance',
          title: `${memberName}${memberTag}`,
          badgeLabel: 'DUPLICATE ATTENDANCE COLLISION',
          firstTx: {
            id: cloud.id,
            cashier: cloud.staff_name || 'SUPERADMIN',
            mainText: `Check-in: ${cloud.plan_name || 'Daily Entry'}`,
            subText: `Entry Fee: ₱${Number(cloud.entry_fee || 0).toFixed(2)}`,
            amount: Number(cloud.entry_fee || 0),
            time: cloud.check_in_time,
          },
          secondTx: {
            id: lc.id,
            cashier: lc.userName || 'Offline Cashier',
            mainText: `Check-in: ${p.plan_name || 'Daily Entry'}`,
            subText: `Entry Fee: ₱${Number(p.entry_fee || 0).toFixed(2)}`,
            amount: Number(p.entry_fee || 0),
            time: p.check_in_time || lc.createdAt,
          },
        });
      } else {
        const firstQty = cloud.requested || (cloud.items && cloud.items[0]?.quantity) || 1;
        const secondQty = p.quantity || (p.items && p.items[0]?.quantity) || 1;

        list.push({
          id: lc.id,
          source: 'local',
          entityType: 'sale',
          title: `Product: ${cloud.product_name || p.product_name || 'Product Sale'}`,
          badgeLabel: 'STOCK OVERDRAWN COLLISION',
          firstTx: {
            id: cloud.conflicting_sale_id,
            cashier: cloud.conflicting_sale_cashier || 'SUPERADMIN',
            mainText: `${firstQty}x ${cloud.product_name || p.product_name || 'Item'}`,
            subText: `Total Sale: ₱${Number(cloud.conflicting_sale_amount || 0).toFixed(2)}`,
            amount: Number(cloud.conflicting_sale_amount || 0),
            time: cloud.conflicting_sale_time,
          },
          secondTx: {
            id: lc.id,
            cashier: lc.userName || 'Offline Cashier',
            mainText: `${secondQty}x ${p.product_name || 'Item'}`,
            subText: `Total Sale: ₱${Number(p.total_amount || 0).toFixed(2)}`,
            amount: Number(p.total_amount || 0),
            time: lc.createdAt,
          },
        });
      }
    });

    return list;
  }, [cloudConflicts, localVaultConflicts, resolvedVaultIds]);

  const handleAction = async (
    id: string,
    action: 'keep_first' | 'keep_second' | 'drop_both'
  ) => {
    try {
      setResolvingId(id);
      await onResolve(id, action);

      // Optimistically remove the resolved conflict item so the list does not close automatically
      setCloudConflicts((prev) => prev.filter((item) => item.id !== id));
      await fetchCloudConflicts();
    } finally {
      setResolvingId(null);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Offline Sync Conflicts"
      className="max-w-4xl p-6 text-left"
    >
      <div className="space-y-4">
        {/* Banner */}
        <div className="flex items-start gap-3 p-3.5 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 text-amber-900 dark:text-amber-200 text-xs sm:text-sm">
          <AlertTriangle className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <p className="font-bold">
              {unifiedList.length} Sync Collision{unifiedList.length !== 1 ? 's' : ''} Detected
            </p>
            <p className="text-xs text-amber-800/90 dark:text-amber-300/80 leading-relaxed">
              Offline transactions collided with records already processed on another register.
              {isAdmin
                ? ' Review both transactions below to choose which check-in or sale to keep, or drop both.'
                : ' An administrator must review and resolve these collisions.'}
            </p>
          </div>
        </div>

        {/* Non-Admin Notice */}
        {!isAdmin && (
          <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-center space-y-2">
            <ShieldAlert className="w-8 h-8 text-slate-500 mx-auto" />
            <h4 className="text-sm font-bold text-slate-800 dark:text-slate-200">
              Administrator Authorization Required
            </h4>
            <p className="text-xs text-slate-500 dark:text-slate-400 max-w-md mx-auto">
              Staff users cannot approve collisions. All conflicting transactions remain suspended until an administrator decides.
            </p>
            <Button variant="secondary" onClick={onClose} className="mt-2 text-xs">
              Close & Notify Admin
            </Button>
          </div>
        )}

        {/* Conflict List */}
        {unifiedList.length === 0 ? (
          <div className="p-8 text-center text-slate-500 space-y-2">
            <CheckCircle className="w-10 h-10 text-emerald-500 mx-auto" />
            <p className="font-semibold text-slate-800 dark:text-slate-200">
              No Pending Conflicts
            </p>
            <p className="text-xs">All offline records are synchronized and approved in the database.</p>
          </div>
        ) : (
          <div className="space-y-4 max-h-[62vh] overflow-y-auto pr-1">
            {unifiedList.map((item) => {
              const isResolving = resolvingId === item.id;

              return (
                <div
                  key={item.id}
                  className="p-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#161920] shadow-sm space-y-4"
                >
                  {/* Item Header */}
                  <div className="flex items-center justify-between gap-2 border-b border-slate-100 dark:border-slate-800 pb-2.5">
                    <div className="flex items-center gap-2">
                      <div className={`p-2 rounded-xl border ${
                        item.entityType === 'attendance'
                          ? 'bg-blue-500/10 text-blue-500 border-blue-500/20'
                          : 'bg-amber-500/10 text-amber-500 border-amber-500/20'
                      }`}>
                        {item.entityType === 'attendance' ? (
                          <UserCheck className="w-4 h-4" />
                        ) : (
                          <Package className="w-4 h-4" />
                        )}
                      </div>
                      <div>
                        <span className={`text-[10px] font-mono font-bold uppercase tracking-wider ${
                          item.entityType === 'attendance'
                            ? 'text-blue-600 dark:text-blue-400'
                            : 'text-amber-600 dark:text-amber-400'
                        }`}>
                          {item.badgeLabel}
                        </span>
                        <h4 className="text-sm font-bold text-slate-900 dark:text-white">
                          {item.title}
                        </h4>
                      </div>
                    </div>

                    <span className="text-[10px] font-mono px-2 py-0.5 rounded-md bg-slate-100 dark:bg-zinc-800 text-slate-600 dark:text-slate-300">
                      Visible to All Admins
                    </span>
                  </div>

                  {/* Side-by-Side Transaction Cards */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                    {/* 1st Transaction */}
                    <div className="p-3.5 rounded-xl border border-blue-200 dark:border-blue-900/60 bg-blue-50/40 dark:bg-blue-950/20 space-y-2 text-left">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-black font-heading uppercase tracking-widest text-blue-700 dark:text-blue-300">
                          1st {item.entityType === 'attendance' ? 'Check-in' : 'Transaction'}
                        </span>
                        <span className="text-[10px] font-mono font-semibold text-slate-500">
                          Cashier: {item.firstTx.cashier}
                        </span>
                      </div>

                      <div className="space-y-1 font-mono text-xs">
                        <p className="font-bold text-slate-900 dark:text-white text-sm">
                          {item.firstTx.mainText}
                        </p>
                        <p className="text-emerald-600 dark:text-emerald-400 font-bold">
                          {item.firstTx.subText}
                        </p>
                        <p className="text-[10px] text-amber-600 dark:text-amber-400 font-medium pt-1">
                          ● Status: In Cloud Ledger (Requires review)
                        </p>
                      </div>
                    </div>

                    {/* 2nd Transaction */}
                    <div className="p-3.5 rounded-xl border border-purple-200 dark:border-purple-900/60 bg-purple-50/40 dark:bg-purple-950/20 space-y-2 text-left">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-black font-heading uppercase tracking-widest text-purple-700 dark:text-purple-300">
                          2nd {item.entityType === 'attendance' ? 'Check-in' : 'Transaction'}
                        </span>
                        <span className="text-[10px] font-mono font-semibold text-slate-500">
                          Cashier: {item.secondTx.cashier}
                        </span>
                      </div>

                      <div className="space-y-1 font-mono text-xs">
                        <p className="font-bold text-slate-900 dark:text-white text-sm">
                          {item.secondTx.mainText}
                        </p>
                        <p className="text-emerald-600 dark:text-emerald-400 font-bold">
                          {item.secondTx.subText}
                        </p>
                        <p className="text-[10px] text-amber-600 dark:text-amber-400 font-medium pt-1">
                          ● Status: Suspended in Vault (Pending approval)
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Admin Selection Buttons */}
                  {isAdmin && (
                    <div className="flex flex-wrap items-center justify-end gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                      <button
                        type="button"
                        disabled={isResolving}
                        onClick={() => handleAction(item.id, 'drop_both')}
                        className="min-h-[40px] px-3.5 py-1.5 rounded-xl text-xs font-bold text-rose-600 hover:bg-rose-50 dark:text-rose-400 dark:hover:bg-rose-950/50 border border-rose-200 dark:border-rose-900/60 transition-all cursor-pointer inline-flex items-center gap-1.5 active:scale-95"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        <span>Drop Both</span>
                      </button>

                      <button
                        type="button"
                        disabled={isResolving}
                        onClick={() => handleAction(item.id, 'keep_first')}
                        className="min-h-[40px] px-4 py-1.5 rounded-xl text-xs font-bold text-blue-700 dark:text-blue-200 bg-blue-100 hover:bg-blue-200 dark:bg-blue-900/60 dark:hover:bg-blue-900 border border-blue-300 dark:border-blue-700 transition-all cursor-pointer inline-flex items-center gap-1.5 active:scale-95 shadow-xs"
                      >
                        {isResolving ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <Check className="w-3.5 h-3.5" />
                        )}
                        <span>Keep 1st {item.entityType === 'attendance' ? 'Check-in' : 'One'} ({item.firstTx.subText})</span>
                      </button>

                      <button
                        type="button"
                        disabled={isResolving}
                        onClick={() => handleAction(item.id, 'keep_second')}
                        className="min-h-[40px] px-4 py-1.5 rounded-xl text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 transition-all cursor-pointer inline-flex items-center gap-1.5 active:scale-95 shadow-md"
                      >
                        {isResolving ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <CheckCircle className="w-3.5 h-3.5" />
                        )}
                        <span>Keep 2nd {item.entityType === 'attendance' ? 'Check-in' : 'One'} ({item.secondTx.subText})</span>
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Modal Footer */}
        <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-200 dark:border-slate-800">
          <Button variant="secondary" onClick={onClose} className="text-xs">
            Done
          </Button>
        </div>
      </div>
    </Modal>
  );
};