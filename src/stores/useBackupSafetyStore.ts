// src/stores/useBackupSafetyStore.ts
import { create } from 'zustand';
import { supabase } from '../lib/supabase/client';
import { logAudit } from '../lib/supabase/audit';
import { clearAppCaches } from '../lib/cacheUtils';
import { toast } from 'react-toastify';

export interface BackupItem {
  id: string;
  filename: string;
  notes: string;
  type: 'manual' | 'auto' | 'archived' | 'safety';
  size_bytes: number;
  created_at: string;
}

interface BackupSafetyState {
  safetyBackup: BackupItem | null;
  isLoading: boolean;
  isVerifying: boolean;
  verifyAction: 'reverting' | 'committing' | null;
  isModalOpen: boolean;
  openModal: () => void;
  closeModal: () => void;
  fetchSafetyBackup: () => Promise<BackupItem | null>;
  subscribeRealtime: () => () => void;
  revertRestoration: () => Promise<void>;
  commitRestoration: () => Promise<void>;
}

export const useBackupSafetyStore = create<BackupSafetyState>((set, get) => ({
  safetyBackup: null,
  isLoading: false,
  isVerifying: false,
  verifyAction: null,
  isModalOpen: false,

  openModal: () => set({ isModalOpen: true }),
  closeModal: () => {
    if (!get().isVerifying) set({ isModalOpen: false });
  },

  fetchSafetyBackup: async () => {
    try {
      set({ isLoading: true });
      const { data, error } = await supabase
        .from('database_backups')
        .select('*')
        .eq('type', 'safety')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) throw error;
      const safety = (data as BackupItem) || null;
      set({ safetyBackup: safety });
      return safety;
    } catch (err) {
      console.warn('Failed to check safety backup status:', err);
      return null;
    } finally {
      set({ isLoading: false });
    }
  },

  subscribeRealtime: () => {
    const channel = supabase
      .channel('database_backups_safety_sync')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'database_backups' },
        () => {
          get().fetchSafetyBackup();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  },

  revertRestoration: async () => {
    const safety = get().safetyBackup;
    if (!safety) return;

    try {
      set({ isVerifying: true, verifyAction: 'reverting' });
      toast.info('Reverting database back to original state...');

      const { data: fileBlob, error: downloadErr } = await supabase.storage
        .from('backups')
        .download(safety.filename);

      if (downloadErr || !fileBlob) throw downloadErr;

      const safetyJson = JSON.parse(await fileBlob.text());
      const { error: restoreError } = await supabase.rpc(
        'restore_database_from_payload',
        { backup_payload: safetyJson }
      );
      if (restoreError) throw restoreError;

      await supabase.storage.from('backups').remove([safety.filename]);
      await supabase.from('database_backups').delete().eq('id', safety.id);

      await logAudit(
        'DATABASE_RESTORE_REVERTED',
        'Reverted recent database restoration. All records returned to original state.'
      );

      // Invalidate caches
      clearAppCaches();

      toast.success('System rolled back to original state. Reloading...');
      set({ safetyBackup: null, isModalOpen: false });

      setTimeout(() => {
        window.location.reload();
      }, 1200);
    } catch (err: any) {
      toast.error(err.message || 'Failed to revert restoration.');
      set({ isVerifying: false, verifyAction: null });
    }
  },

  commitRestoration: async () => {
    const safety = get().safetyBackup;
    if (!safety) return;

    try {
      set({ isVerifying: true, verifyAction: 'committing' });

      await supabase.storage.from('backups').remove([safety.filename]);
      await supabase.from('database_backups').delete().eq('id', safety.id);

      await logAudit(
        'DATABASE_RESTORE_COMMITTED',
        'Committed restoration checkpoint modifications.'
      );

      // Invalidate caches
      clearAppCaches();

      toast.success('Restoration confirmed. Safety checkpoint cleared.');
      set({
        safetyBackup: null,
        isModalOpen: false,
        isVerifying: false,
        verifyAction: null,
      });

      // Soft refresh data across app
      window.dispatchEvent(new CustomEvent('backup-committed'));
    } catch (err: any) {
      toast.error(err.message || 'Failed to commit changes.');
      set({ isVerifying: false, verifyAction: null });
    }
  },
}));