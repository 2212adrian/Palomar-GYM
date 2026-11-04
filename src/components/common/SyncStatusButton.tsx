// src/components/common/SyncStatusButton.tsx
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { AlertTriangle, CloudOff, RefreshCw } from 'lucide-react';
import { getDecryptedPendingTransactions, type DecryptedTransaction } from '../../lib/offlineVault';
import { executeOfflineSync, resolveConflictAction } from '../../lib/backgroundSyncService';
import { SyncConflictDashboard } from './SyncConflictDashboard';
import { useAuthStore } from '../../stores/authStore';
import { isSuperAdmin } from '../../constants/auth';
import { toast } from 'react-toastify';

export const SyncStatusButton: React.FC = () => {
  const { user, profile } = useAuthStore() as any;
  const isAdmin = Boolean(
    isSuperAdmin(user?.email) || profile?.role === 'admin'
  );

  const [conflicts, setConflicts] = useState<DecryptedTransaction[]>([]);
  const [pendingCount, setPendingCount] = useState<number>(0);
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  const isSyncInProgressRef = useRef<boolean>(false);

  const refreshVaultStatus = useCallback(async () => {
    try {
      const items = await getDecryptedPendingTransactions();
      const conflictItems = items.filter((tx) => tx.status === 'conflict');
      const pendingItems = items.filter((tx) => tx.status === 'pending');
      setConflicts(conflictItems);
      setPendingCount(pendingItems.length);
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

    const interval = setInterval(refreshVaultStatus, 5000);

    return () => {
      window.removeEventListener('palomar:sync-updated', handleSyncUpdated);
      window.removeEventListener('online', handleSyncUpdated);
      window.removeEventListener('offline', handleSyncUpdated);
      clearInterval(interval);
    };
  }, [refreshVaultStatus]);

  // AUTOMATIC BACKGROUND SYNC: No manual click needed. Runs automatically when online with pending items!
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
    action: 'keep_offline' | 'keep_cloud' | 'drop_both'
  ) => {
    await resolveConflictAction(id, action);
    await refreshVaultStatus();
  };

  // If nothing in vault, do not render extra buttons
  if (conflicts.length === 0 && pendingCount === 0) {
    return null;
  }

  const isOffline = typeof navigator !== 'undefined' && !navigator.onLine;

  return (
    <>
      {conflicts.length > 0 ? (
        <button
          type="button"
          onClick={() => setIsModalOpen(true)}
          className="flex items-center gap-1.5 px-2.5 py-1 sm:py-1.5 rounded-xl border border-amber-500/50 bg-amber-500/15 hover:bg-amber-500/25 text-amber-700 dark:text-amber-300 transition-all text-xs font-heading font-extrabold tracking-wider uppercase active:scale-95 shadow-xs cursor-pointer select-none animate-pulse shrink-0"
          title={`${conflicts.length} offline sync conflict(s) require review`}
        >
          <AlertTriangle className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400 shrink-0" />
          <span className="hidden sm:inline">
            {isAdmin ? `Sync Conflicts (${conflicts.length})` : `Conflicts Pending (${conflicts.length})`}
          </span>
          <span className="inline sm:hidden font-mono font-bold">
            {conflicts.length}
          </span>
        </button>
      ) : isSyncing ? (
        <div
          className="flex items-center gap-1.5 px-2.5 py-1 sm:py-1.5 rounded-xl border border-blue-500/30 bg-blue-500/10 text-blue-700 dark:text-blue-300 transition-all text-xs font-heading font-bold tracking-wider uppercase shadow-xs select-none shrink-0"
          title="Auto-syncing offline transactions..."
        >
          <RefreshCw className="w-3.5 h-3.5 animate-spin text-blue-500 shrink-0" />
          <span className="hidden sm:inline">Auto-Syncing ({pendingCount})...</span>
          <span className="inline sm:hidden font-mono font-bold">{pendingCount}</span>
        </div>
      ) : isOffline ? (
        <button
          type="button"
          onClick={() => {
            toast.info(
              `${pendingCount} offline transaction(s) encrypted in vault. Auto-sync will run automatically as soon as internet is restored.`
            );
          }}
          className="flex items-center gap-1.5 px-2.5 py-1 sm:py-1.5 rounded-xl border border-zinc-500/30 bg-zinc-500/10 hover:bg-zinc-500/20 text-zinc-700 dark:text-zinc-300 transition-all text-xs font-heading font-bold tracking-wider uppercase active:scale-95 shadow-xs cursor-pointer select-none shrink-0"
          title={`${pendingCount} offline transaction(s) stored locally. Will auto-sync when online.`}
        >
          <CloudOff className="w-3.5 h-3.5 text-zinc-500 shrink-0" />
          <span className="hidden sm:inline">{pendingCount} Saved Offline</span>
          <span className="inline sm:hidden font-mono font-bold">{pendingCount}</span>
        </button>
      ) : (
        <div
          className="flex items-center gap-1.5 px-2.5 py-1 sm:py-1.5 rounded-xl border border-blue-500/30 bg-blue-500/10 text-blue-700 dark:text-blue-300 transition-all text-xs font-heading font-bold tracking-wider uppercase shadow-xs select-none shrink-0"
          title="Auto-syncing offline transactions..."
        >
          <RefreshCw className="w-3.5 h-3.5 animate-spin text-blue-500 shrink-0" />
          <span className="hidden sm:inline">Auto-Syncing ({pendingCount})...</span>
          <span className="inline sm:hidden font-mono font-bold">{pendingCount}</span>
        </div>
      )}

      {/* Side-by-side Conflict Resolution Modal */}
      <SyncConflictDashboard
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        conflicts={conflicts}
        onResolve={handleResolve}
      />
    </>
  );
};
