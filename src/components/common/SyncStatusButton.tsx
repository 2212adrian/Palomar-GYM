// src/components/common/SyncStatusButton.tsx
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { AlertTriangle, CloudOff, RefreshCw, Layers } from 'lucide-react';
import { supabase } from '../../lib/supabase/client';
import { getDecryptedPendingTransactions, type DecryptedTransaction } from '../../lib/offlineVault';
import { executeOfflineSync, resolveConflictAction } from '../../lib/backgroundSyncService';
import { SyncConflictDashboard } from './SyncConflictDashboard';
import { useAuthStore } from '../../stores/authStore';
import { useActionQueueStore } from '../../stores/useActionQueueStore';
import { isSuperAdmin } from '../../constants/auth';
import { toast } from 'react-toastify';

export const SyncStatusButton: React.FC = () => {
  const { user, profile } = useAuthStore() as any;
  const isAdmin = Boolean(
    isSuperAdmin(user?.email) || profile?.role?.toLowerCase() === 'admin'
  );

  const { queueCount, toggleDrawer } = useActionQueueStore();

  const [conflicts, setConflicts] = useState<DecryptedTransaction[]>([]);
  const [cloudConflictCount, setCloudConflictCount] = useState<number>(0);
  const [pendingCount, setPendingCount] = useState<number>(0);
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  const isSyncInProgressRef = useRef<boolean>(false);

  const refreshVaultStatus = useCallback(async () => {
    try {
      const isOnline = typeof navigator === 'undefined' || navigator.onLine;
      const items = await getDecryptedPendingTransactions();
      const localConflictIds = items.filter((tx) => tx.status === 'conflict').map((tx) => tx.id);

      if (isOnline && localConflictIds.length > 0) {
        const { data: resolvedList } = await supabase
          .from('sync_conflicts')
          .select('id, second_transaction, resolution, resolved_by_name')
          .eq('status', 'resolved');

        if (resolvedList && resolvedList.length > 0) {
          for (const res of resolvedList) {
            const vId = res.second_transaction?.vault_id;
            if (vId && localConflictIds.includes(vId)) {
              await resolveConflictAction(res.id, res.resolution || 'drop_both');
            }
          }
        }
      }

      const refreshedItems = await getDecryptedPendingTransactions();
      const conflictItems = refreshedItems.filter((tx) => tx.status === 'conflict');
      const pendingItems = refreshedItems.filter((tx) => tx.status === 'pending');
      setConflicts(conflictItems);
      setPendingCount(pendingItems.length);

      if (isOnline) {
        const { data: cloudData } = await supabase
          .from('sync_conflicts')
          .select('id')
          .eq('status', 'pending');

        setCloudConflictCount(cloudData ? cloudData.length : 0);
      } else {
        setCloudConflictCount(0);
      }
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    refreshVaultStatus();

    const handleSyncUpdated = () => {
      refreshVaultStatus();
    };

    window.addEventListener('palomar:sync-updated', handleSyncUpdated);
    window.addEventListener('online', handleSyncUpdated);
    window.addEventListener('offline', handleSyncUpdated);

    let channel: any = null;
    const isOnline = typeof navigator === 'undefined' || navigator.onLine;

    if (isOnline) {
      channel = supabase
        .channel(`sync_conflicts_realtime_badge_${Date.now()}`)
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'sync_conflicts' },
          async (payload: any) => {
            const record = payload.new;
            if (record && record.status === 'resolved' && record.second_transaction?.vault_id) {
              const vaultId = record.second_transaction.vault_id;
              try {
                const localItems = await getDecryptedPendingTransactions();
                if (localItems.some((i) => i.id === vaultId)) {
                  await resolveConflictAction(record.id, record.resolution || 'drop_both');
                  toast.info(
                    `Conflict on ${record.product_name} was resolved by ${record.resolved_by_name || 'an Admin'}.`,
                    { toastId: `conflict-resolved-${record.id}` }
                  );
                }
              } catch {
                // ignore
              }
            }
            refreshVaultStatus();
          }
        )
        .subscribe();
    }

    const interval = setInterval(() => {
      if (typeof navigator === 'undefined' || navigator.onLine) {
        refreshVaultStatus();
      }
    }, 8000);

    return () => {
      window.removeEventListener('palomar:sync-updated', handleSyncUpdated);
      window.removeEventListener('online', handleSyncUpdated);
      window.removeEventListener('offline', handleSyncUpdated);
      if (channel) supabase.removeChannel(channel);
      clearInterval(interval);
    };
  }, [refreshVaultStatus]);

  useEffect(() => {
    const isOnline = typeof navigator !== 'undefined' && navigator.onLine;
    if (pendingCount > 0 && isOnline && !isSyncInProgressRef.current) {
      isSyncInProgressRef.current = true;
      setIsSyncing(true);

      executeOfflineSync()
        .then((result) => {
          refreshVaultStatus();
          if (result.syncedCount > 0) {
            toast.success(`Automatically synchronized ${result.syncedCount} transaction(s).`);
          }
        })
        .catch(() => {})
        .finally(() => {
          isSyncInProgressRef.current = false;
          setIsSyncing(false);
        });
    }
  }, [pendingCount, refreshVaultStatus]);

  const handleResolve = async (
    id: string,
    action: 'keep_first' | 'keep_second' | 'drop_both'
  ) => {
    await resolveConflictAction(id, action);
    await refreshVaultStatus();
  };

  const totalConflictsCount = Math.max(conflicts.length, cloudConflictCount);
  const activeCount = Math.max(pendingCount, queueCount);
  const isOffline = typeof navigator !== 'undefined' && !navigator.onLine;

  if (totalConflictsCount === 0 && activeCount === 0 && !isModalOpen && !isSyncing) {
    return null;
  }

  return (
    <>
      {totalConflictsCount > 0 ? (
        <button
          type="button"
          onClick={() => setIsModalOpen(true)}
          className="flex items-center gap-1.5 px-2.5 py-1 sm:py-1.5 rounded-xl border border-amber-500/50 bg-amber-500/15 hover:bg-amber-500/25 text-amber-700 dark:text-amber-300 transition-all text-xs font-heading font-extrabold tracking-wider uppercase active:scale-95 shadow-xs cursor-pointer select-none animate-pulse shrink-0"
          title={`${totalConflictsCount} offline sync conflict(s) require review`}
        >
          <AlertTriangle className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400 shrink-0" />
          <span className="hidden sm:inline">
            {isAdmin ? `Sync Conflicts (${totalConflictsCount})` : `Conflicts (${totalConflictsCount})`}
          </span>
          <span className="inline sm:hidden font-mono font-bold">
            {totalConflictsCount}
          </span>
        </button>
      ) : isSyncing ? (
        <button
          type="button"
          onClick={toggleDrawer}
          className="flex items-center gap-1.5 px-2.5 py-1 sm:py-1.5 rounded-xl border border-blue-500/30 bg-blue-500/10 hover:bg-blue-500/20 text-blue-700 dark:text-blue-300 transition-all text-xs font-heading font-bold tracking-wider uppercase shadow-xs cursor-pointer select-none shrink-0"
          title="Syncing offline transactions. Click to view queue."
        >
          <RefreshCw className="w-3.5 h-3.5 animate-spin text-blue-500 shrink-0" />
          <span className="hidden sm:inline">Syncing ({activeCount})...</span>
          <span className="inline sm:hidden font-mono font-bold">{activeCount}</span>
        </button>
      ) : isOffline ? (
        <button
          type="button"
          onClick={toggleDrawer}
          className="flex items-center gap-1.5 px-2.5 py-1 sm:py-1.5 rounded-xl border border-amber-500/40 bg-amber-500/15 hover:bg-amber-500/25 text-amber-700 dark:text-amber-300 transition-all text-xs font-heading font-bold tracking-wider uppercase active:scale-95 shadow-xs cursor-pointer select-none shrink-0"
          title={`${activeCount} offline transaction(s) queued. Click to open queue.`}
        >
          <CloudOff className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400 shrink-0" />
          <span className="hidden sm:inline">Queue ({activeCount})</span>
          <span className="min-w-[18px] h-[18px] px-1 rounded-full bg-amber-500 text-slate-900 text-[9px] font-bold font-mono flex items-center justify-center">
            {activeCount}
          </span>
        </button>
      ) : (
        <button
          type="button"
          onClick={toggleDrawer}
          className="flex items-center gap-1.5 px-2.5 py-1 sm:py-1.5 rounded-xl border border-amber-500/40 bg-amber-500/15 hover:bg-amber-500/25 text-amber-700 dark:text-amber-300 transition-all text-xs font-heading font-bold tracking-wider uppercase active:scale-95 shadow-xs cursor-pointer select-none shrink-0"
          title={`${activeCount} pending offline action(s). Click to view queue.`}
        >
          <Layers className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400 shrink-0" />
          <span className="hidden sm:inline">Queue</span>
          <span className="min-w-[18px] h-[18px] px-1 rounded-full bg-amber-500 text-slate-900 text-[9px] font-bold font-mono flex items-center justify-center">
            {activeCount}
          </span>
        </button>
      )}

      <SyncConflictDashboard
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        conflicts={conflicts}
        onResolve={handleResolve}
      />
    </>
  );
};
