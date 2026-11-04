// src/components/layouts/ActionQueueDrawer.tsx
import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  X,
  RotateCcw,
  CloudOff,
  Cloud,
  CheckCircle2,
  AlertTriangle,
  Trash2,
  UserPlus,
  UserCheck,
  CreditCard,
  ShoppingCart,
  Calendar,
  AlertCircle,
  Clock,
  Layers,
} from 'lucide-react';
import { useActionQueueStore } from '../../stores/useActionQueueStore';
import { format } from 'date-fns';
import { triggerHapticButton } from '../../lib/hapticsService';

export const ActionQueueDrawer: React.FC = () => {
  const {
    isDrawerOpen,
    closeDrawer,
    queueItems,
    queueCount,
    isLoading,
    isSyncing,
    removeItem,
    triggerManualSync,
    initListeners,
  } = useActionQueueStore();

  const [isOnline, setIsOnline] = useState(
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );

  useEffect(() => {
    const unsub = initListeners();
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      unsub();
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [initListeners]);

  // Handle Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isDrawerOpen) {
        closeDrawer();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isDrawerOpen, closeDrawer]);

  if (!isDrawerOpen) return null;

  const getActionIcon = (type: string) => {
    switch (type) {
      case 'member_create':
      case 'member_update':
        return <UserPlus className="w-4 h-4 text-blue-500" />;
      case 'attendance':
        return <UserCheck className="w-4 h-4 text-emerald-500" />;
      case 'card_purchase':
      case 'batch_card_purchase':
        return <CreditCard className="w-4 h-4 text-indigo-500" />;
      case 'sale':
        return <ShoppingCart className="w-4 h-4 text-violet-500" />;
      case 'subscription':
        return <Calendar className="w-4 h-4 text-amber-500" />;
      case 'incident_create':
      case 'incident_update':
        return <AlertCircle className="w-4 h-4 text-rose-500" />;
      default:
        return <Layers className="w-4 h-4 text-slate-500" />;
    }
  };

  const getActionTitle = (type: string) => {
    switch (type) {
      case 'member_create':
        return 'Register Member';
      case 'member_update':
        return 'Update Member';
      case 'attendance':
        return 'Logbook Attendance Check-in';
      case 'card_purchase':
        return 'RFID Card Purchase';
      case 'batch_card_purchase':
        return 'Batch RFID Purchase';
      case 'sale':
        return 'POS Merchandise Sale';
      case 'subscription':
        return 'Subscription Renewal';
      case 'incident_create':
        return 'Incident Report Submission';
      default:
        return type.replace(/_/g, ' ').toUpperCase();
    }
  };

  const formatSummary = (item: any) => {
    const p = item.payload || {};
    if (item.type === 'member_create') {
      return `Member: ${p.full_name || p.fullName || 'New Member'} (${p.phone || p.email || 'Local'})`;
    }
    if (item.type === 'attendance') {
      return `Member: ${p.member_name || p.memberName || 'Walk-in'} • Method: ${p.method || 'Manual'}`;
    }
    if (item.type === 'sale') {
      const itemsCount = p.items?.length || 1;
      return `Amount: ₱${Number(p.totalAmount || p.total_amount || 0).toLocaleString()} • ${itemsCount} item(s)`;
    }
    if (item.type === 'card_purchase' || item.type === 'batch_card_purchase') {
      return `Card UID: ${p.card_uid || p.cardUid || 'Pending assignment'} • ₱${p.amount || 0}`;
    }
    if (item.type === 'subscription') {
      return `Plan: ${p.planName || p.plan_type || 'Monthly'} • Member: ${p.memberName || p.member_name || 'Member'}`;
    }
    if (item.type === 'incident_create') {
      return `Title: ${p.title || 'Incident Log'} • Priority: ${p.priority || 'Medium'}`;
    }
    return 'Pending transaction parameters';
  };

  return createPortal(
    <div
      className="fixed inset-0 z-50 overflow-hidden"
      aria-labelledby="action-queue-drawer-title"
      role="dialog"
      aria-modal="true"
    >
      {/* Dimmed backdrop */}
      <div
        className="fixed inset-0 bg-black/50 backdrop-blur-xs transition-opacity"
        onClick={closeDrawer}
      />

      <div className="fixed inset-y-0 right-0 max-w-full flex pl-10">
        <div className="w-screen max-w-md bg-white dark:bg-[#161920] shadow-2xl border-l border-slate-200 dark:border-slate-800 flex flex-col justify-between">
          {/* Header */}
          <div className="p-4 sm:p-5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-3 bg-slate-50/60 dark:bg-slate-900/40">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl bg-[#123c73]/10 dark:bg-blue-500/15 text-[#123c73] dark:text-blue-400 flex items-center justify-center font-bold">
                <Layers className="w-5 h-5" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h2
                    id="action-queue-drawer-title"
                    className="font-black text-sm uppercase tracking-wider text-slate-900 dark:text-white font-heading"
                  >
                    Action Queue
                  </h2>
                  <span className="font-mono text-xs px-2 py-0.5 rounded-full font-bold bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/25">
                    {queueCount} pending
                  </span>
                </div>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 font-medium">
                  Encrypted IndexedDB offline cache
                </p>
              </div>
            </div>

            <button
              onClick={() => {
                triggerHapticButton();
                closeDrawer();
              }}
              className="p-2 rounded-xl text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-200/50 dark:hover:bg-slate-800 transition-colors cursor-pointer"
              title="Close drawer (Esc)"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Network Bar */}
          <div className="px-4 py-2.5 bg-slate-100/70 dark:bg-slate-800/40 border-b border-slate-200/80 dark:border-slate-800/80 flex items-center justify-between text-xs">
            <div className="flex items-center gap-2">
              {isOnline ? (
                <>
                  <Cloud className="w-3.5 h-3.5 text-emerald-500" />
                  <span className="font-medium text-slate-700 dark:text-slate-300">
                    Connection Online
                  </span>
                </>
              ) : (
                <>
                  <CloudOff className="w-3.5 h-3.5 text-amber-500" />
                  <span className="font-medium text-amber-700 dark:text-amber-400 font-semibold">
                    Offline Mode (Queuing Locally)
                  </span>
                </>
              )}
            </div>

            <button
              onClick={() => {
                triggerHapticButton();
                triggerManualSync();
              }}
              disabled={isSyncing || queueCount === 0 || !isOnline}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#123c73] hover:bg-[#0e2c56] dark:bg-blue-600 dark:hover:bg-blue-700 text-white text-xs font-bold transition-all disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer shadow-2xs"
            >
              <RotateCcw className={`w-3 h-3 ${isSyncing ? 'animate-spin' : ''}`} />
              <span>{isSyncing ? 'Syncing...' : 'Sync Now'}</span>
            </button>
          </div>

          {/* Queue Items List */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {isLoading && queueItems.length === 0 ? (
              <div className="py-12 flex flex-col items-center justify-center text-slate-400">
                <RotateCcw className="w-6 h-6 animate-spin mb-2" />
                <span className="text-xs">Loading queued records...</span>
              </div>
            ) : queueItems.length === 0 ? (
              <div className="py-16 flex flex-col items-center justify-center text-center p-6 select-none">
                <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 text-emerald-500 flex items-center justify-center mb-3">
                  <CheckCircle2 className="w-6 h-6" />
                </div>
                <h3 className="text-sm font-bold text-slate-800 dark:text-slate-200">
                  Action Queue Empty
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 max-w-xs leading-relaxed">
                  All member registrations, check-ins, sales, and renewals are fully synchronized with the cloud database.
                </p>
              </div>
            ) : (
              queueItems.map((item) => (
                <div
                  key={item.id}
                  className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#1b2029] shadow-2xs space-y-2 hover:border-slate-300 dark:hover:border-slate-700 transition-all"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <div className="p-1.5 rounded-lg bg-slate-100 dark:bg-slate-800">
                        {getActionIcon(item.type)}
                      </div>
                      <div>
                        <h4 className="text-xs font-bold text-slate-900 dark:text-slate-100 font-heading">
                          {getActionTitle(item.type)}
                        </h4>
                        <span className="font-mono text-[10px] text-slate-400">
                          {item.id.slice(0, 24)}...
                        </span>
                      </div>
                    </div>

                    <button
                      onClick={() => {
                        triggerHapticButton();
                        removeItem(item.id);
                      }}
                      className="p-1.5 rounded-lg text-slate-400 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-colors cursor-pointer"
                      title="Discard queued item"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  <p className="text-xs text-slate-700 dark:text-slate-300 bg-slate-50 dark:bg-slate-900/60 p-2 rounded-lg font-mono text-[11px] break-all border border-slate-100 dark:border-slate-800/80">
                    {formatSummary(item)}
                  </p>

                  <div className="flex items-center justify-between text-[10px] text-slate-400 dark:text-slate-500 pt-1 border-t border-slate-100 dark:border-slate-800/60">
                    <span className="flex items-center gap-1 font-medium">
                      <Clock className="w-3 h-3" />
                      {item.createdAt
                        ? format(new Date(item.createdAt), 'MMM dd, h:mm a')
                        : 'Just now'}
                    </span>
                    <span className="truncate max-w-[150px]">
                      By: <span className="text-slate-600 dark:text-slate-400 font-semibold">{item.userName || 'Staff'}</span>
                    </span>
                  </div>

                  {item.status === 'conflict' && (
                    <div className="flex items-center gap-1.5 text-xs text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/30 p-2 rounded-lg font-medium border border-rose-200 dark:border-rose-900/40">
                      <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                      <span>Sync conflict: {item.conflictReason || 'Cloud rejection'}</span>
                    </div>
                  )}
                </div>
              ))
            )}
          </div>

          {/* Footer */}
          <div className="p-4 border-t border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/30 text-center">
            <p className="text-[11px] text-slate-400 dark:text-slate-500">
              Operations will sync automatically once an active connection is restored.
            </p>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
};
