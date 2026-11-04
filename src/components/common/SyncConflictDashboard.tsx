// src/components/common/SyncConflictDashboard.tsx
import React, { useState } from 'react';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { useAuthStore } from '../../stores/authStore';
import type { DecryptedTransaction } from '../../lib/offlineVault';
import {
  AlertTriangle,
  Database,
  Smartphone,
  Trash2,
  CheckCircle,
  Package,
  UserCheck,
  ShieldAlert,
  Loader2,
  XCircle,
} from 'lucide-react';

export interface SyncConflictDashboardProps {
  isOpen: boolean;
  onClose: () => void;
  conflicts: DecryptedTransaction[];
  onResolve: (id: string, action: 'keep_offline' | 'keep_cloud' | 'drop_both') => Promise<void>;
  onResolveAllKeepOffline?: () => Promise<void>;
  onResolveAllDrop?: () => Promise<void>;
}

export const SyncConflictDashboard: React.FC<SyncConflictDashboardProps> = ({
  isOpen,
  onClose,
  conflicts,
  onResolve,
}) => {
  const { user, profile } = useAuthStore();
  const isAdmin = profile?.role === 'admin' || user?.email?.toLowerCase().includes('admin');

  const [resolvingId, setResolvingId] = useState<string | null>(null);

  const handleAction = async (
    id: string,
    action: 'keep_offline' | 'keep_cloud' | 'drop_both'
  ) => {
    try {
      setResolvingId(id);
      await onResolve(id, action);
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
              {conflicts.length} Transaction Collision{conflicts.length > 1 ? 's' : ''} Detected
            </p>
            <p className="text-xs text-amber-800/90 dark:text-amber-300/80 leading-relaxed">
              These items occurred while offline and conflict with newer records from other devices in the cloud database.
              {isAdmin
                ? ' Compare both versions below to decide which record to retain.'
                : ' As a staff member, your non-conflicting items were synced. An administrator must resolve these collisions.'}
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
              Staff users cannot manually overwrite database collisions. Your pending items remain safely held in the local vault until an administrator logs in to review.
            </p>
            <Button variant="secondary" onClick={onClose} className="mt-2 text-xs">
              Close & Notify Admin
            </Button>
          </div>
        )}

        {/* Conflict List */}
        {conflicts.length === 0 ? (
          <div className="p-8 text-center text-slate-500 space-y-2">
            <CheckCircle className="w-10 h-10 text-emerald-500 mx-auto" />
            <p className="font-semibold text-slate-800 dark:text-slate-200">
              No Pending Conflicts
            </p>
            <p className="text-xs">All offline records are synchronized with Supabase.</p>
          </div>
        ) : (
          <div className="space-y-4 max-h-[60vh] overflow-y-auto pr-1">
            {conflicts.map((conflict) => {
              const isSale = conflict.type === 'sale';
              const isAttendance = conflict.type === 'attendance';
              const isCard = conflict.type === 'card_purchase';
              const isSub = conflict.type === 'subscription';

              const payload = conflict.payload || {};
              const cloud = conflict.conflictCloudData || {};
              const isResolving = resolvingId === conflict.id;

              return (
                <div
                  key={conflict.id}
                  className="p-3.5 sm:p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#161920] shadow-xs space-y-3"
                >
                  {/* Item Header */}
                  <div className="flex items-center justify-between gap-2 border-b border-slate-100 dark:border-slate-800 pb-2">
                    <div className="flex items-center gap-2">
                      <div className="p-1.5 rounded-lg bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300">
                        {isSale ? (
                          <Package className="w-4 h-4" />
                        ) : (
                          <UserCheck className="w-4 h-4" />
                        )}
                      </div>
                      <div>
                        <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-amber-700 dark:text-amber-400">
                          {conflict.conflictReason === 'insufficient_stock'
                            ? 'Stock Overdrawn Collision'
                            : conflict.conflictReason === 'duplicate_attendance'
                            ? 'Duplicate Check-In Collision'
                            : 'Session Gated Collision'}
                        </span>
                        <h4 className="text-xs sm:text-sm font-bold text-slate-900 dark:text-white">
                          {isSale
                            ? payload.product_name || (payload.items && payload.items[0]?.productName) || 'Product Sale'
                            : payload.customer_name || 'Member Attendance'}
                        </h4>
                      </div>
                    </div>

                    <span className="text-[9px] font-mono text-slate-600 dark:text-slate-300">
                      Cashier: {conflict.userName}
                    </span>
                  </div>

                  {/* Comparison Columns (Side-by-Side on Desktop, Stacked on Mobile) */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {/* Cloud State */}
                    <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 space-y-1.5">
                      <div className="flex items-center gap-1.5 text-xs font-bold text-slate-800 dark:text-slate-200">
                        <Database className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
                        <span>Cloud Database State</span>
                      </div>
                      <div className="text-xs text-slate-700 dark:text-slate-300 space-y-0.5 font-mono">
                        {isSale && (
                          <>
                            <p>
                              Current Stock in Cloud:{' '}
                              <span className="font-bold text-rose-600 dark:text-rose-400">
                                {cloud.current_stock ?? '0'} unit(s)
                              </span>
                            </p>
                            <p className="text-[11px] text-slate-600 dark:text-slate-300">
                              Status: Depleted by other register
                            </p>
                          </>
                        )}
                        {(isAttendance || isCard || isSub) && (
                          <>
                            <p>
                              Existing Record:{' '}
                              <span className="font-bold text-blue-600 dark:text-blue-400">
                                {cloud.customer_name || payload.customer_name}
                              </span>
                            </p>
                            <p className="text-[11px] text-slate-600 dark:text-slate-300">
                              Checked In At:{' '}
                              {cloud.check_in_time
                                ? new Date(cloud.check_in_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                                : 'Today'}
                            </p>
                          </>
                        )}
                      </div>
                    </div>

                    {/* Offline Pending State */}
                    <div className="p-3 rounded-lg bg-amber-50/60 dark:bg-amber-950/20 border border-amber-200/80 dark:border-amber-900/50 space-y-1.5">
                      <div className="flex items-center gap-1.5 text-xs font-bold text-amber-900 dark:text-amber-200">
                        <Smartphone className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
                        <span>Incoming Offline Vault</span>
                      </div>
                      <div className="text-xs text-slate-700 dark:text-slate-300 space-y-0.5 font-mono">
                        {isSale && (
                          <>
                            <p>
                              Requested Quantity:{' '}
                              <span className="font-bold text-amber-700 dark:text-amber-300">
                                {payload.quantity || (payload.items && payload.items[0]?.quantity) || 1} unit(s)
                              </span>
                            </p>
                            <p>
                              Total Amount: ₱{Number(payload.total_amount || 0).toFixed(2)}
                            </p>
                          </>
                        )}
                        {(isAttendance || isCard || isSub) && (
                          <>
                            <p>
                              Customer:{' '}
                              <span className="font-bold text-amber-700 dark:text-amber-300">
                                {payload.customer_name}
                              </span>
                            </p>
                            <p>
                              Fee: ₱{Number(payload.entry_fee || payload.amount || 0).toFixed(2)} ({payload.plan_name || 'Pass'})
                            </p>
                          </>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Admin Resolution Action Bar */}
                  {isAdmin && (
                    <div className="flex flex-wrap items-center justify-end gap-2 pt-1 border-t border-slate-100 dark:border-slate-800">
                      <button
                        type="button"
                        disabled={isResolving}
                        onClick={() => handleAction(conflict.id, 'drop_both')}
                        className="min-h-[40px] px-3 py-1.5 rounded-lg text-xs font-medium text-rose-700 hover:bg-rose-50 dark:text-rose-400 dark:hover:bg-rose-950/50 border border-rose-200 dark:border-rose-900/60 transition-colors cursor-pointer inline-flex items-center gap-1.5"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        <span>Drop Offline</span>
                      </button>

                      <button
                        type="button"
                        disabled={isResolving}
                        onClick={() => handleAction(conflict.id, 'keep_cloud')}
                        className="min-h-[40px] px-3 py-1.5 rounded-lg text-xs font-medium text-slate-700 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800 border border-slate-300 dark:border-slate-700 transition-colors cursor-pointer inline-flex items-center gap-1.5"
                      >
                        <XCircle className="w-3.5 h-3.5" />
                        <span>Keep Cloud Only</span>
                      </button>

                      <button
                        type="button"
                        disabled={isResolving}
                        onClick={() => handleAction(conflict.id, 'keep_offline')}
                        className="min-h-[40px] px-3.5 py-1.5 rounded-lg text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 transition-colors cursor-pointer inline-flex items-center gap-1.5 shadow-xs"
                      >
                        {isResolving ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <CheckCircle className="w-3.5 h-3.5" />
                        )}
                        <span>Force Sync Offline</span>
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