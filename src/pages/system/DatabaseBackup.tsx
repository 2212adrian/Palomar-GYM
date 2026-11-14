// src/pages/system/DatabaseBackup.tsx
import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '../../lib/supabase/client';
import { logAudit } from '../../lib/supabase/audit';
import { clearAppCaches } from '../../lib/cacheUtils';
import { useBackupSafetyStore } from '../../stores/useBackupSafetyStore';
import { useAuthStore } from '../../stores/authStore';
import { isSuperAdmin } from '../../constants/auth';
import { useCashSessionStore } from '../../stores/useCashSessionStore';
import { useNavbarStore } from '../../stores/useNavbarStore';
import { createPortal } from 'react-dom';
import { Table } from '../../components/ui/Table';
import { Modal } from '../../components/ui/Modal';
import { Button } from '../../components/ui/Button';
import type { Column } from '../../components/ui/Table';
import { useResponsiveItemsPerPage } from '../../lib/useResponsiveItemsPerPage';
import { toast } from 'react-toastify';
import {
  Database,
  ShieldAlert,
  RefreshCw,
  Calendar,
  Info,
  Archive,
  PlusCircle,
  Lock,
  ArrowLeftRight,
  Undo2,
  ShieldCheck,
  Trash2,
  Loader2,
  AlertTriangle,
} from 'lucide-react';

interface BackupItem {
  id: string;
  filename: string;
  notes: string;
  type: 'manual' | 'auto' | 'archived' | 'safety';
  size_bytes: number;
  created_at: string;
}

export const DatabaseBackup: React.FC = () => {
  const [backups, setBackups] = useState<BackupItem[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isCreating, setIsCreating] = useState<boolean>(false);
  const [selectedTypeFilter, setSelectedTypeFilter] = useState<string>('auto');
  const [mobileBackupSearch, setMobileBackupSearch] = useState<string>('');

  // Manual Backup Dialog State
  const [isCreateModalOpen, setIsCreateModalOpen] = useState<boolean>(false);
  const [backupNotes, setBackupNotes] = useState<string>('');

  // Restore Modal State
  const [isRestoreModalOpen, setIsRestoreModalOpen] = useState<boolean>(false);
  const [restoreTarget, setRestoreTarget] = useState<BackupItem | null>(null);
  const [isRestoring, setIsRestoring] = useState<boolean>(false);
  const [countdown, setCountdown] = useState<number>(3);
  const [verifyPassword, setVerifyPassword] = useState<string>('');
  const [restoreConfirmText, setRestoreConfirmText] = useState<string>('');

  // SuperAdmin Access Control & Terminal States
  const { user, profile } = useAuthStore() as any;
  const { activeSession } = useCashSessionStore();
  const isNavFloatingOpen = Boolean(useNavbarStore((s) => s.activeFloating));

  const isSuperAdminOnly = useMemo(() => {
    return isSuperAdmin(user?.email || profile?.email);
  }, [user?.email, profile?.email]);

  // Dual-Path Verification: Detect if user has a password or signed in via Google only
  const isGoogleOnly = useMemo(() => {
    if (!user) return false;
    const rawProviders = user.app_metadata?.providers;
    const singleProvider = user.app_metadata?.provider;
    const providers: string[] = Array.isArray(rawProviders)
      ? rawProviders
      : singleProvider
        ? [singleProvider]
        : [];
    const identities: any[] = user.identities || [];
    const hasEmail =
      providers.includes('email') ||
      identities.some((id: any) => id.provider === 'email');
    const isGoogle =
      providers.includes('google') ||
      identities.some((id: any) => id.provider === 'google');
    return isGoogle && !hasEmail;
  }, [user]);

  const [hasPassword, setHasPassword] = useState<boolean>(!isGoogleOnly);

  useEffect(() => {
    let isMounted = true;
    const checkPasswordStatus = async () => {
      if (!user) return;
      try {
        const { data, error } = await supabase.rpc('check_user_has_password');
        if (!error && typeof data === 'boolean' && isMounted) {
          setHasPassword(data);
          return;
        }
      } catch {}

      if (isMounted) {
        setHasPassword(!isGoogleOnly);
      }
    };
    checkPasswordStatus();
    return () => {
      isMounted = false;
    };
  }, [user, isGoogleOnly]);

  // Global Safety Store state hook
  const safetyBackup = useBackupSafetyStore((s) => s?.safetyBackup ?? null);
  const isVerifying = useBackupSafetyStore((s) => s?.isVerifying ?? false);
  const revertRestoration = useBackupSafetyStore((s) => s?.revertRestoration);
  const commitRestoration = useBackupSafetyStore((s) => s?.commitRestoration);
  const fetchSafetyBackup = useBackupSafetyStore((s) => s?.fetchSafetyBackup);

  const enforceAutoBackupRetention = async (items: BackupItem[]) => {
    const autoItems = items
      .filter((b) => b.type === 'auto')
      .sort(
        (a, b) =>
          new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      );

    if (autoItems.length > 3) {
      const toDelete = autoItems.slice(3);
      try {
        await supabase.storage
          .from('backups')
          .remove(toDelete.map((b) => b.filename));
        await supabase
          .from('database_backups')
          .delete()
          .in(
            'id',
            toDelete.map((b) => b.id)
          );

        await logAudit(
          'DATABASE_BACKUP_ROTATED',
          `Automated 3-day retention policy executed: pruned ${toDelete.length} oldest automated backup(s).`
        );
        toast.info(
          `Retention cycle rotated: ${toDelete.length} oldest automated backup(s) pruned to maintain 3-day window.`
        );

        const deleteIds = new Set(toDelete.map((b) => b.id));
        return items.filter((b) => !deleteIds.has(b.id));
      } catch (e) {
        console.warn('Failed to prune oldest auto backups:', e);
      }
    }
    return items;
  };

  const fetchBackups = async () => {
    try {
      setIsLoading(true);
      const { data, error } = await supabase
        .from('database_backups')
        .select('id, filename, notes, type, size_bytes, created_at')
        .order('created_at', { ascending: false });

      if (error) throw error;
      let items = (data as BackupItem[]) || [];

      // Automatically enforce 3-day retention policy on automated backups
      if (items.filter((b) => b.type === 'auto').length > 3) {
        items = await enforceAutoBackupRetention(items);
      }

      setBackups(items);
      return items;
    } catch (err: any) {
      console.warn(
        'Failed to retrieve backups from table:',
        err?.message || err
      );
      toast.error('Failed to load backup history.');
      return [];
    } finally {
      setIsLoading(false);
    }
  };

  const handleDeleteBackup = async (backup: BackupItem) => {
    if (
      !window.confirm(
        `Are you sure you want to permanently delete backup "${backup.notes || backup.filename}"? This action cannot be undone.`
      )
    ) {
      return;
    }
    try {
      await supabase.storage.from('backups').remove([backup.filename]);
      const { error } = await supabase
        .from('database_backups')
        .delete()
        .eq('id', backup.id);
      if (error) throw error;

      await logAudit(
        'DATABASE_BACKUP_DELETED',
        `Deleted database backup: "${backup.notes || backup.filename}" (${backup.type}).`,
        backup.id
      );

      toast.success('Backup permanently deleted.');
      fetchBackups();
    } catch (err: any) {
      toast.error(err?.message || 'Failed to delete backup.');
    }
  };

 useEffect(() => {
    fetchBackups();
    if (fetchSafetyBackup) {
      fetchSafetyBackup();
    }

    const handleBackupCommitted = () => {
      fetchBackups();
    };

    window.addEventListener('backup-committed', handleBackupCommitted);
    return () => {
      window.removeEventListener('backup-committed', handleBackupCommitted);
    };
  }, [fetchSafetyBackup]);

  useEffect(() => {
    if (!isRestoreModalOpen) return;
    setCountdown(3);
    setVerifyPassword('');
    setRestoreConfirmText('');
    const timer = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [isRestoreModalOpen]);

  const handleCreateBackup = async () => {
    if (activeSession) {
      toast.error(
        'Cannot create a database backup while a cash session is active. Please close the cash drawer first.'
      );
      return;
    }
    try {
      setIsCreating(true);
      const customNoteText = backupNotes.trim() || 'Manual recovery point';

      const manualFiles = backups
        .filter((b) => b.type === 'manual')
        .sort(
          (a, b) =>
            new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
        );

      if (manualFiles.length >= 5) {
        const toDelete = manualFiles.slice(0, manualFiles.length - 4);
        await supabase.storage
          .from('backups')
          .remove(toDelete.map((b) => b.filename));
        await supabase
          .from('database_backups')
          .delete()
          .in(
            'id',
            toDelete.map((b) => b.id)
          );
      }

      const { data: dumpPayload, error: dumpError } = await supabase.rpc(
        'export_database_dump'
      );
      if (dumpError) throw dumpError;

      const timestamp = Date.now();
      const filename = `manual_${timestamp}.json`;
      const jsonBlob = new Blob([JSON.stringify(dumpPayload, null, 2)], {
        type: 'application/json',
      });

      await supabase.storage
        .from('backups')
        .upload(filename, jsonBlob, { contentType: 'application/json' });

      let insertError = null;
      const primaryInsert = await supabase
        .from('database_backups')
        .insert({
          filename,
          notes: customNoteText,
          type: 'manual',
          size_bytes: jsonBlob.size,
          payload: dumpPayload,
          backup_data: dumpPayload,
        });

      if (primaryInsert.error) {
        const fallbackInsert = await supabase
          .from('database_backups')
          .insert({
            filename,
            notes: customNoteText,
            type: 'manual',
            size_bytes: jsonBlob.size,
            payload: dumpPayload,
          });
        insertError = fallbackInsert.error;
      }

      if (insertError) throw insertError;

      await logAudit(
        'DATABASE_BACKUP_CREATED',
        `Created manual database backup checkpoint: "${customNoteText}".`
      );

      toast.success('Backup saved to storage successfully.');
      setIsCreateModalOpen(false);
      setBackupNotes('');
      // Automatically switch filter to Manual
      setSelectedTypeFilter('manual');
      fetchBackups();
    } catch (err: any) {
      toast.error(err?.message || 'Failed to trigger backup.');
    } finally {
      setIsCreating(false);
    }
  };

  const handleArchiveBackup = async (backupId: string) => {
    try {
      const targetBackup = backups.find((b) => b.id === backupId);
      if (!targetBackup) throw new Error('Backup not found.');

      const archivedFiles = backups
        .filter((b) => b.type === 'archived')
        .sort(
          (a, b) =>
            new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
        );

      if (archivedFiles.length >= 3) {
        const toDelete = archivedFiles.slice(0, archivedFiles.length - 2);
        await supabase.storage
          .from('backups')
          .remove(toDelete.map((b) => b.filename));
        await supabase
          .from('database_backups')
          .delete()
          .in(
            'id',
            toDelete.map((b) => b.id)
          );
      }

      const { error } = await supabase
        .from('database_backups')
        .update({ type: 'archived' })
        .eq('id', backupId);

      if (error) throw error;

      await logAudit(
        'DATABASE_BACKUP_ARCHIVED',
        `Archived database backup: "${targetBackup.notes || targetBackup.filename}".`,
        targetBackup.id
      );

      toast.success('Backup successfully archived.');
      fetchBackups();
    } catch (err: any) {
      toast.error(err?.message || 'Failed to archive backup.');
    }
  };

  const handleUnarchiveBackup = async (backupId: string) => {
    try {
      const targetBackup = backups.find((b) => b.id === backupId);
      if (!targetBackup) throw new Error('Backup not found.');

      const manualFiles = backups
        .filter((b) => b.type === 'manual')
        .sort(
          (a, b) =>
            new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
        );

      if (manualFiles.length >= 5) {
        const toDelete = manualFiles.slice(0, manualFiles.length - 4);
        await supabase.storage
          .from('backups')
          .remove(toDelete.map((b) => b.filename));
        await supabase
          .from('database_backups')
          .delete()
          .in(
            'id',
            toDelete.map((b) => b.id)
          );
      }

      const { error } = await supabase
        .from('database_backups')
        .update({ type: 'manual' })
        .eq('id', backupId);

      if (error) throw error;

      await logAudit(
        'DATABASE_BACKUP_UNARCHIVED',
        `Returned backup to manual listings: "${targetBackup.notes || targetBackup.filename}".`,
        targetBackup.id
      );

      toast.success('Backup unarchived.');
      fetchBackups();
    } catch (err: any) {
      toast.error(err?.message || 'Failed to unarchive backup.');
    }
  };

  const handleRestoreClick = (backup: BackupItem) => {
    if (activeSession) {
      toast.error(
        'Cannot proceed with system restoration while a cash session is open. Please close the active cash session first.'
      );
      return;
    }
    setRestoreTarget(backup);
    setIsRestoreModalOpen(true);
  };

  const handleConfirmRestore = async () => {
    if (!restoreTarget) return;

    if (activeSession) {
      toast.error(
        'Cannot proceed with system restoration while a cash session is open. Please close the active cash session first.'
      );
      return;
    }

    if (hasPassword && !verifyPassword.trim()) {
      toast.error('Please enter your password to authorize this action.');
      return;
    }

    if (!hasPassword && restoreConfirmText.trim().toUpperCase() !== 'CONFIRM RESTORE') {
      toast.error('Please type "CONFIRM RESTORE" to authorize this rollback.');
      return;
    }

    try {
      setIsRestoring(true);

      if (hasPassword) {
        const { data: isValidPassword, error: authError } = await supabase.rpc(
          'verify_user_password',
          { entered_password: verifyPassword }
        );

        if (authError || !isValidPassword) {
          throw new Error('Authorization failed. Incorrect password.');
        }
      }

      const existingSafety = backups.find((b) => b.type === 'safety');
      if (existingSafety) {
        await supabase.storage
          .from('backups')
          .remove([existingSafety.filename]);
        await supabase
          .from('database_backups')
          .delete()
          .eq('id', existingSafety.id);
      }

      toast.info('Generating Pre-Restore Safety Backup...');
      const { data: currentDump, error: dumpErr } = await supabase.rpc(
        'export_database_dump'
      );
      if (dumpErr) throw dumpErr;

      if (currentDump && typeof currentDump === 'object') {
        Object.keys(currentDump).forEach((tableKey) => {
          const rows = currentDump[tableKey];
          if (Array.isArray(rows)) {
            currentDump[tableKey] = rows.map((row: any) => {
              if (row && typeof row === 'object') {
                const cleanRow = { ...row };
                if (cleanRow.is_quarantined === undefined || cleanRow.is_quarantined === null) {
                  cleanRow.is_quarantined = false;
                }
                return cleanRow;
              }
              return row;
            });
          }
        });
      }

      const safetyFilename = `safety_${Date.now()}.json`;
      const safetyBlob = new Blob([JSON.stringify(currentDump, null, 2)], {
        type: 'application/json',
      });

      const { error: safetyUploadError } = await supabase.storage
        .from('backups')
        .upload(safetyFilename, safetyBlob, {
          contentType: 'application/json',
        });
      if (safetyUploadError) throw safetyUploadError;

      let safetyInsertError = null;
      const primarySafetyInsert = await supabase
        .from('database_backups')
        .insert({
          filename: safetyFilename,
          notes: 'Pre-Restore Backup (Auto-Safety)',
          type: 'safety',
          size_bytes: safetyBlob.size,
          payload: currentDump,
          backup_data: currentDump,
        });

      if (primarySafetyInsert.error) {
        const fallbackSafetyInsert = await supabase
          .from('database_backups')
          .insert({
            filename: safetyFilename,
            notes: 'Pre-Restore Backup (Auto-Safety)',
            type: 'safety',
            size_bytes: safetyBlob.size,
            payload: currentDump,
          });
        safetyInsertError = fallbackSafetyInsert.error;
      }

      if (safetyInsertError) throw safetyInsertError;

      let backupJson: any = null;
      const { data: fullRecord } = await supabase
        .from('database_backups')
        .select('*')
        .eq('id', restoreTarget.id)
        .single();

      if (fullRecord?.payload || (fullRecord as any)?.backup_data) {
        backupJson = fullRecord?.payload || (fullRecord as any)?.backup_data;
      } else {
        toast.info('Downloading backup file from storage...');
        const { data: fileBlob, error: downloadError } = await supabase.storage
          .from('backups')
          .download(restoreTarget.filename);

        if (downloadError || !fileBlob) {
          throw new Error(
            `Failed to download backup file: ${downloadError?.message}`
          );
        }
        backupJson = JSON.parse(await fileBlob.text());
      }

      if (backupJson && typeof backupJson === 'object') {
        Object.keys(backupJson).forEach((tableKey) => {
          const rows = backupJson[tableKey];
          if (Array.isArray(rows)) {
            backupJson[tableKey] = rows.map((row: any) => {
              if (row && typeof row === 'object') {
                const cleanRow = { ...row };
                if (cleanRow.is_quarantined === undefined || cleanRow.is_quarantined === null) {
                  cleanRow.is_quarantined = false;
                }
                return cleanRow;
              }
              return row;
            });
          }
        });
      }

      toast.info('Restoring database snapshot...');
      const { error: restoreError } = await supabase.rpc(
        'restore_database_from_payload',
        { backup_payload: backupJson }
      );
      if (restoreError) throw restoreError;

      clearAppCaches();

      const targetBackupLabel = restoreTarget.notes || restoreTarget.filename;
      await logAudit(
        'DATABASE_RESTORE_INITIATED',
        `Initiated rollback restoration to checkpoint: "${targetBackupLabel}".`,
        restoreTarget.id
      );

      toast.success(
        'System restored. Please verify the integrity of the records.'
      );
      setIsRestoreModalOpen(false);
      setRestoreTarget(null);
      setVerifyPassword('');

      if (fetchSafetyBackup) await fetchSafetyBackup();
      await fetchBackups();
    } catch (err: any) {
      toast.error(err?.message || 'Database restoration process failed.');
    } finally {
      setIsRestoring(false);
    }
  };

  const formatSize = (bytes: number) => {
    if (!bytes || bytes === 0) return '0 B';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const safetyBackupPoint =
    safetyBackup || backups.find((b) => b.type === 'safety');

  const filteredBackups = backups.filter((b) => {
    if (b.type === 'safety') return false;
    if (selectedTypeFilter === 'all') return true;
    return b.type === selectedTypeFilter;
  });

  const mobileDisplayBackups = useMemo(() => {
    let list = filteredBackups;
    if (mobileBackupSearch.trim()) {
      const q = mobileBackupSearch.trim().toLowerCase();
      list = list.filter((b) => {
        const fn = (b.filename || '').toLowerCase();
        const nt = (b.notes || '').toLowerCase();
        return fn.includes(q) || nt.includes(q);
      });
    }
    return list;
  }, [filteredBackups, mobileBackupSearch]);

  const manualBackupsCount = backups.filter((b) => b.type === 'manual').length;
  const autoBackupsCount = backups.filter((b) => b.type === 'auto').length;
  const archivedBackupsCount = backups.filter(
    (b) => b.type === 'archived'
  ).length;
  const allBackupsCount = backups.filter((b) => b.type !== 'safety').length;
  const totalFilteredCount = filteredBackups.length;

  const kpiConfig = useMemo(() => {
    switch (selectedTypeFilter) {
      case 'auto':
        return {
          kpi1: {
            title: 'AUTOMATED DAILY FILES',
            value: `${autoBackupsCount} / 3`,
            subtext: 'Active daily rotation slots',
            colorClass:
              'bg-blue-500/10 text-blue-600 dark:text-blue-500 border-blue-500/20',
            icon: (
              <RefreshCw className="w-6 h-6 text-blue-600 dark:text-blue-400" />
            ),
          },
          kpi2: {
            title: 'ROTATION PERIOD',
            value: '3 DAY CYCLE',
            subtext: '12:00 AM Manila / 16:00 UTC',
            colorClass:
              'bg-slate-500/10 text-slate-600 dark:text-slate-400 border-slate-500/20',
            icon: (
              <Calendar className="w-6 h-6 text-slate-600 dark:text-slate-400" />
            ),
          },
          kpi3: {
            title: 'RETENTION POLICY',
            value: 'AUTO-DELETE',
            subtext: 'Oldest rotated out after 3 days',
            colorClass:
              'bg-blue-500/10 text-blue-600 dark:text-blue-500 border-blue-500/20',
            icon: (
              <RefreshCw className="w-6 h-6 text-blue-600 dark:text-blue-400" />
            ),
          },
        };
      case 'manual':
        return {
          kpi1: {
            title: 'MANUAL CHECKPOINTS',
            value: `${manualBackupsCount} / 5`,
            subtext: 'Active custom-saved checkpoints',
            colorClass:
              'bg-emerald-500/10 text-emerald-600 dark:text-emerald-500 border-emerald-500/20',
            icon: (
              <PlusCircle className="w-6 h-6 text-emerald-600 dark:text-emerald-500" />
            ),
          },
          kpi2: {
            title: 'MANUAL ROTATION',
            value: 'LIMIT: 5 FILES',
            subtext: 'Oldest deleted if exceeded',
            colorClass:
              'bg-slate-500/10 text-slate-600 dark:text-slate-400 border-slate-500/20',
            icon: (
              <RefreshCw className="w-6 h-6 text-slate-600 dark:text-slate-400" />
            ),
          },
          kpi3: {
            title: 'RETENTION POLICY',
            value: 'PERMANENT',
            subtext: 'Exempt from auto daily rotation',
            colorClass:
              'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20',
            icon: (
              <Lock className="w-6 h-6 text-emerald-600 dark:text-emerald-400" />
            ),
          },
        };
      case 'archived':
        return {
          kpi1: {
            title: 'ARCHIVED SNAPSHOTS',
            value: `${archivedBackupsCount} / 3`,
            subtext: 'Checkpoints saved indefinitely',
            colorClass:
              'bg-amber-500/10 text-amber-600 dark:text-amber-500 border-amber-500/20',
            icon: (
              <Archive className="w-6 h-6 text-amber-600 dark:text-amber-500" />
            ),
          },
          kpi2: {
            title: 'ARCHIVE LIMIT',
            value: 'LIMIT: 3 FILES',
            subtext: 'Oldest deleted if exceeded',
            colorClass:
              'bg-slate-500/10 text-slate-600 dark:text-slate-400 border-slate-500/20',
            icon: (
              <RefreshCw className="w-6 h-6 text-slate-600 dark:text-slate-400" />
            ),
          },
          kpi3: {
            title: 'RETENTION POLICY',
            value: 'LOCK PRESERVED',
            subtext: 'Bypasses automatic rotation',
            colorClass:
              'bg-amber-500/10 text-amber-600 dark:text-amber-500 border-amber-500/20',
            icon: (
              <Lock className="w-6 h-6 text-amber-600 dark:text-amber-500" />
            ),
          },
        };
      default:
        return {
          kpi1: {
            title: 'TOTAL RECOVERY FILES',
            value: `${totalFilteredCount} ACTIVE`,
            subtext: 'Across all categories',
            colorClass:
              'bg-slate-500/10 text-(--color-primary) dark:text-(--color-primary-light) border-slate-500/20',
            icon: (
              <Database className="w-6 h-6 text-(--color-primary) dark:text-(--color-primary-light)" />
            ),
          },
          kpi2: {
            title: 'MANUAL CHECKPOINTS',
            value: `${manualBackupsCount} / 5`,
            subtext: 'Manual storage usage',
            colorClass:
              'bg-emerald-500/10 text-emerald-600 dark:text-emerald-500 border-emerald-500/20',
            icon: (
              <PlusCircle className="w-6 h-6 text-emerald-600 dark:text-emerald-500" />
            ),
          },
          kpi3: {
            title: 'ARCHIVED SNAPSHOTS',
            value: `${archivedBackupsCount} / 3`,
            subtext: 'Archived storage usage',
            colorClass:
              'bg-amber-500/10 text-amber-600 dark:text-amber-500 border-amber-500/20',
            icon: (
              <Archive className="w-6 h-6 text-amber-600 dark:text-amber-500" />
            ),
          },
        };
    }
  }, [
    selectedTypeFilter,
    manualBackupsCount,
    autoBackupsCount,
    archivedBackupsCount,
    totalFilteredCount,
  ]);

  const columns: Column<BackupItem>[] = [
    {
      key: 'filename',
      header: 'BACKUP INFORMATION',
      sortable: true,
      render: (b) => {
        const dateObj = new Date(b.created_at);
        const dateStr = dateObj.toLocaleDateString('en-US', {
          month: 'short',
          day: 'numeric',
          year: 'numeric',
          timeZone: 'Asia/Manila',
        });
        const timeStr = dateObj.toLocaleTimeString('en-US', {
          hour: 'numeric',
          minute: '2-digit',
          hour12: true,
          timeZone: 'Asia/Manila',
        });

        return (
          <div className="flex items-center gap-3.5 py-1">
            <div
              className={`p-2.5 rounded-xl border shrink-0 ${
                b.type === 'archived'
                  ? 'bg-amber-500/10 border-amber-500/20 text-amber-600 dark:text-amber-500'
                  : b.type === 'manual'
                    ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-600 dark:text-emerald-400'
                    : 'bg-(--color-primary)/10 border-(--color-primary)/20 text-(--color-primary) dark:text-(--color-primary-light)'
              }`}
            >
              <Database className="w-5 h-5 sm:w-5.5 sm:h-5.5" />
            </div>
            <div className="space-y-1 min-w-0">
              <span className="text-sm font-semibold text-(--color-text) block tracking-wide truncate">
                Backup from {dateStr}
              </span>
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs text-slate-500 dark:text-slate-400 font-medium">
                  {timeStr} (PHT)
                </span>
                {b.notes && (
                  <>
                    <span className="text-slate-400 dark:text-slate-600 font-bold">
                      •
                    </span>
                    <span className="text-xs text-slate-600 dark:text-(--color-text) dark:opacity-85 italic font-medium max-w-[180px] sm:max-w-xs md:max-w-sm truncate">
                      "{b.notes}"
                    </span>
                  </>
                )}
                {b.type === 'manual' && (
                  <span className="px-1.5 py-0.5 bg-emerald-500/10 text-[9px] text-emerald-700 dark:text-emerald-400 border border-emerald-500/20 rounded-md font-bold tracking-wider uppercase scale-90">
                    Manual
                  </span>
                )}
              </div>
            </div>
          </div>
        );
      },
    },
    {
      key: 'type',
      header: 'TYPE',
      sortable: true,
      render: (b) => {
        if (b.type === 'archived') {
          return (
            <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-amber-500/10 text-[10px] text-amber-600 dark:text-amber-400 border border-amber-500/20 rounded-full font-bold tracking-wider uppercase whitespace-nowrap">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
              ARCHIVED
            </span>
          );
        }
        if (b.type === 'manual') {
          return (
            <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-emerald-500/10 text-[10px] text-emerald-700 dark:text-emerald-400 border border-emerald-500/20 rounded-full font-bold tracking-wider uppercase whitespace-nowrap">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 dark:bg-emerald-400" />
              MANUAL
            </span>
          );
        }
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-blue-500/10 text-[10px] text-blue-600 dark:text-blue-400 border border-blue-500/20 rounded-full font-bold tracking-wider uppercase whitespace-nowrap">
            <span className="w-1.5 h-1.5 rounded-full bg-blue-500 dark:bg-blue-400" />
            AUTO
          </span>
        );
      },
    },
    {
      key: 'created_at',
      header: 'AGE',
      sortable: true,
      render: (b) => {
        const diffMs = new Date().getTime() - new Date(b.created_at).getTime();
        const diffMins = Math.floor(diffMs / (1000 * 60));
        const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
        const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

        let friendlyAge = 'Just now';
        if (diffMins >= 1 && diffMins < 60) {
          friendlyAge = `${diffMins} mins ago`;
        } else if (diffHours >= 1 && diffHours < 24) {
          friendlyAge = `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
        } else if (diffDays >= 1) {
          friendlyAge = `${diffDays} day${diffDays > 1 ? 's' : ''} ago`;
        }

        return (
          <div className="flex items-center gap-1.5 text-slate-600 dark:text-(--color-text) dark:opacity-85 font-medium whitespace-nowrap">
            <Calendar className="w-4 h-4 text-slate-400 dark:opacity-70" />
            <span className="text-xs">{friendlyAge}</span>
          </div>
        );
      },
    },
    {
      key: 'size_bytes',
      header: 'SIZE',
      sortable: true,
      render: (b) => (
        <span className="text-xs text-slate-700 dark:text-(--color-text) font-mono font-medium dark:opacity-85 whitespace-nowrap">
          {formatSize(b.size_bytes)}
        </span>
      ),
    },
    {
      key: 'actions',
      header: 'ACTIONS',
      headerClassName: 'text-right',
      cellClassName: 'text-right',
      render: (b) => (
        <div className="flex items-center justify-end gap-2 sm:gap-2.5">
          {/* Exposed Archive / Unarchive Button */}
          {b.type !== 'archived' ? (
            <button
              onClick={() => handleArchiveBackup(b.id)}
              className="px-2.5 py-1.5 bg-amber-500/10 hover:bg-amber-500 text-amber-600 dark:text-amber-400 hover:text-white text-[10px] font-heading tracking-wider uppercase rounded-lg transition-all cursor-pointer font-bold border border-amber-500/20 whitespace-nowrap flex items-center gap-1"
              title="Archive this backup"
            >
              <Archive className="w-3.5 h-3.5" />
              <span>Archive</span>
            </button>
          ) : (
            <button
              onClick={() => handleUnarchiveBackup(b.id)}
              className="px-2.5 py-1.5 bg-emerald-500/10 hover:bg-emerald-600 text-emerald-600 dark:text-emerald-400 hover:text-white text-[10px] font-heading tracking-wider uppercase rounded-lg transition-all cursor-pointer font-bold border border-emerald-500/20 whitespace-nowrap flex items-center gap-1"
              title="Unarchive this backup"
            >
              <Archive className="w-3.5 h-3.5 rotate-180" />
              <span>Unarchive</span>
            </button>
          )}

          {/* Exposed Restore Button */}
          <button
            disabled={!!safetyBackupPoint || !!activeSession}
            onClick={() => handleRestoreClick(b)}
            title={
              activeSession
                ? 'Cannot restore while a cash session is open'
                : undefined
            }
            className="px-3 py-1.5 bg-(--color-primary)/10 hover:bg-(--color-primary) text-(--color-primary) dark:text-(--color-primary-light) hover:text-white text-[10px] font-heading tracking-wider uppercase rounded-lg transition-all cursor-pointer font-bold border border-(--color-primary)/20 disabled:opacity-30 disabled:cursor-not-allowed whitespace-nowrap"
          >
            RESTORE
          </button>

          {/* Delete Button (Prohibited for Automated Backups) */}
          {b.type !== 'auto' && (
            <button
              onClick={() => handleDeleteBackup(b)}
              className="p-1.5 rounded-lg text-slate-400 hover:text-rose-500 hover:bg-rose-500/10 transition-colors cursor-pointer"
              title="Delete this backup"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      ),
    },
  ];

  const responsiveItemsPerPage = useResponsiveItemsPerPage();

  if (!isSuperAdminOnly) {
    return (
      <div className="p-6 sm:p-8 rounded-2xl bg-(--bg-card) border border-rose-500/30 text-center space-y-3 shadow-xs">
        <div className="w-12 h-12 rounded-2xl bg-rose-500/10 border border-rose-500/20 text-rose-500 flex items-center justify-center mx-auto">
          <ShieldAlert className="w-6 h-6" />
        </div>
        <h3 className="font-heading font-black text-base uppercase tracking-wider text-(--color-text)">
          SuperAdmin Clearance Required
        </h3>
        <p className="text-xs text-slate-600 dark:text-slate-400 max-w-md mx-auto leading-relaxed">
          Database Backup &amp; Terminal controls belong exclusively to the
          Superadmin Console. Regular Admin and Staff accounts cannot access
          this section.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6 sm:space-y-8 font-body text-(--color-text) rounded-3xl pb-28 sm:pb-16">
      {/* ACTIVE CASH SESSION NOTICE BANNER */}
      {activeSession && (
        <div className="p-4 sm:p-5 bg-amber-500/10 dark:bg-amber-500/5 border border-amber-500/30 rounded-2xl flex items-start gap-3.5 shadow-sm text-left">
          <div className="p-2.5 bg-amber-500/20 rounded-xl text-amber-600 dark:text-amber-500 border border-amber-500/20 shrink-0">
            <AlertTriangle className="w-5 h-5 sm:w-6 sm:h-6" />
          </div>
          <div className="space-y-1">
            <h4 className="text-sm font-heading tracking-wide text-amber-700 dark:text-amber-400 font-bold uppercase">
              Active Cash Session Detected
            </h4>
            <p className="text-xs text-slate-600 dark:text-slate-300 font-medium leading-relaxed">
              A cash session is currently open. You must close the active cash drawer session before performing database backups or system restorations.
            </p>
          </div>
        </div>
      )}

      {/* POST-RESTORE SYSTEM VERIFICATION CARD */}
      {safetyBackupPoint && (
        <div className="p-4 sm:p-5 bg-amber-500/10 dark:bg-amber-500/5 border border-amber-500/30 rounded-2xl flex flex-col md:flex-row md:items-center justify-between gap-4 animate-slide-up shadow-lg">
          <div className="flex items-start gap-3.5">
            <div className="p-3 bg-amber-500/20 rounded-xl text-amber-600 dark:text-amber-500 border border-amber-500/20 shrink-0">
              <ArrowLeftRight className="w-5 h-5 sm:w-6 sm:h-6 animate-pulse" />
            </div>
            <div className="space-y-1">
              <h4 className="text-sm font-heading tracking-wide text-amber-700 dark:text-amber-500 uppercase">
                Backup Restored (Review Phase)
              </h4>
              <p className="text-xs text-slate-600 dark:text-slate-300 font-semibold leading-relaxed">
                Your backup has been restored. Please verify your records before
                finalizing or reverting changes.
              </p>
            </div>
          </div>
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 shrink-0 w-full md:w-auto">
            <button
              disabled={isVerifying}
              onClick={() => revertRestoration && revertRestoration()}
              className="w-full sm:w-auto px-4 py-2 border border-red-500/30 bg-red-500/10 hover:bg-red-600 text-red-600 dark:text-red-400 hover:text-white text-[10px] font-heading tracking-wider uppercase rounded-lg transition-all cursor-pointer font-bold disabled:opacity-50 text-center flex items-center justify-center gap-1.5"
            >
              <Undo2 className="w-3.5 h-3.5" />
              <span>{isVerifying ? 'Reverting...' : 'Revert Changes'}</span>
            </button>
            <button
              disabled={isVerifying}
              onClick={async () => {
                if (commitRestoration) await commitRestoration();
                fetchBackups();
              }}
              className="w-full sm:w-auto px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-[10px] font-heading tracking-wider uppercase rounded-lg transition-all cursor-pointer font-bold disabled:opacity-50 text-center flex items-center justify-center gap-1.5 shadow-sm"
            >
              <ShieldCheck className="w-3.5 h-3.5" />
              <span>{isVerifying ? 'Saving...' : 'Confirm Changes'}</span>
            </button>
          </div>
        </div>
      )}

      {/* BACKUPS VIEW CONTAINER */}
      <div className="space-y-6 sm:space-y-8">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h2 className="text-xl font-heading tracking-widest uppercase text-(--color-text)">
              SYSTEM BACKUPS
            </h2>
            <p className="text-sm text-slate-600 dark:text-slate-400 mt-1 font-medium">
              Automated backups rotate every 3 days. Checkpoints are kept in
              secure object storage.
            </p>
          </div>

          <div className="hidden sm:flex items-center gap-3">
            <button
              disabled={!!activeSession}
              onClick={() => {
                if (activeSession) {
                  toast.error(
                    'Please close the active cash session before saving a backup.'
                  );
                  return;
                }
                setIsCreateModalOpen(true);
              }}
              title={
                activeSession
                  ? 'Close the active cash session before saving a backup'
                  : undefined
              }
              className="inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-emerald-600 text-white hover:bg-emerald-700 text-[10px] font-heading tracking-widest uppercase rounded-lg transition-all cursor-pointer shadow-lg shadow-emerald-600/10 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <PlusCircle className="w-3.5 h-3.5" />
              SAVE TODAY'S BACKUP
            </button>
          </div>
        </div>

        {/* Dynamic KPI Widgets (2 rows layout on mobile) */}
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-5">
          {/* Card 1 */}
          <div className="p-3.5 sm:p-5 bg-(--bg-card) border border-(--border-color) rounded-2xl flex flex-col justify-between gap-2.5">
            <div className="flex items-center gap-2.5">
              <div
                className={`p-2 sm:p-2.5 rounded-xl border shrink-0 ${kpiConfig.kpi1.colorClass}`}
              >
                {kpiConfig.kpi1.icon}
              </div>
              <span className="text-[10px] sm:text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider truncate">
                {kpiConfig.kpi1.title}
              </span>
            </div>
            <div className="space-y-0.5">
              {isLoading ? (
                <div className="h-6 w-20 bg-slate-200 dark:bg-white/10 rounded animate-pulse" />
              ) : (
                <span className="text-base sm:text-lg font-extrabold text-(--color-text) font-heading tracking-wide block animate-fade-in truncate">
                  {kpiConfig.kpi1.value}
                </span>
              )}
              {isLoading ? (
                <div className="h-3 w-28 bg-slate-100 dark:bg-white/5 rounded animate-pulse mt-1" />
              ) : (
                <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 block animate-fade-in truncate">
                  {kpiConfig.kpi1.subtext}
                </span>
              )}
            </div>
          </div>

          {/* Card 2 */}
          <div className="p-3.5 sm:p-5 bg-(--bg-card) border border-(--border-color) rounded-2xl flex flex-col justify-between gap-2.5">
            <div className="flex items-center gap-2.5">
              <div
                className={`p-2 sm:p-2.5 rounded-xl border shrink-0 ${kpiConfig.kpi2.colorClass}`}
              >
                {kpiConfig.kpi2.icon}
              </div>
              <span className="text-[10px] sm:text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider truncate">
                {kpiConfig.kpi2.title}
              </span>
            </div>
            <div className="space-y-0.5">
              {isLoading ? (
                <div className="h-6 w-20 bg-slate-200 dark:bg-white/10 rounded animate-pulse" />
              ) : (
                <span className="text-base sm:text-lg font-extrabold text-(--color-text) font-heading tracking-wide block animate-fade-in truncate">
                  {kpiConfig.kpi2.value}
                </span>
              )}
              {isLoading ? (
                <div className="h-3 w-28 bg-slate-100 dark:bg-white/5 rounded animate-pulse mt-1" />
              ) : (
                <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 block animate-fade-in truncate">
                  {kpiConfig.kpi2.subtext}
                </span>
              )}
            </div>
          </div>

          {/* Card 3 (Spans 2 columns on mobile to ensure exactly 2 rows) */}
          <div className="p-3.5 sm:p-5 bg-(--bg-card) border border-(--border-color) rounded-2xl flex flex-col justify-between gap-2.5 col-span-2 lg:col-span-1">
            <div className="flex items-center gap-2.5">
              <div
                className={`p-2 sm:p-2.5 rounded-xl border shrink-0 ${kpiConfig.kpi3.colorClass}`}
              >
                {kpiConfig.kpi3.icon}
              </div>
              <span className="text-[10px] sm:text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider truncate">
                {kpiConfig.kpi3.title}
              </span>
            </div>
            <div className="space-y-0.5">
              {isLoading ? (
                <div className="h-6 w-20 bg-slate-200 dark:bg-white/10 rounded animate-pulse" />
              ) : (
                <span className="text-base sm:text-lg font-extrabold text-(--color-text) font-heading tracking-wide block animate-fade-in truncate">
                  {kpiConfig.kpi3.value}
                </span>
              )}
              {isLoading ? (
                <div className="h-3 w-28 bg-slate-100 dark:bg-white/5 rounded animate-pulse mt-1" />
              ) : (
                <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 block animate-fade-in truncate">
                  {kpiConfig.kpi3.subtext}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Filter and Search Bar */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 sm:gap-4 bg-(--bg-card) p-3 sm:p-4 rounded-2xl border border-(--border-color)">
          {/* Exposed Filter Segment Buttons */}
          <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-none p-1 bg-(--bg-page) border border-(--border-color) rounded-xl">
            <button
              type="button"
              onClick={() => setSelectedTypeFilter('auto')}
              className={`px-3 py-1.5 rounded-lg text-xs font-heading tracking-wider uppercase transition-all cursor-pointer font-bold flex items-center gap-1.5 shrink-0 ${
                selectedTypeFilter === 'auto'
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'text-slate-600 dark:text-slate-400 hover:text-(--color-text) hover:bg-(--bg-card)'
              }`}
            >
              <span>Automated</span>
              <span
                className={`text-[10px] px-1.5 py-0.5 rounded-full font-mono ${
                  selectedTypeFilter === 'auto'
                    ? 'bg-white/20 text-white'
                    : 'bg-slate-200 dark:bg-white/10 text-slate-600 dark:text-slate-300'
                }`}
              >
                {autoBackupsCount}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setSelectedTypeFilter('manual')}
              className={`px-3 py-1.5 rounded-lg text-xs font-heading tracking-wider uppercase transition-all cursor-pointer font-bold flex items-center gap-1.5 shrink-0 ${
                selectedTypeFilter === 'manual'
                  ? 'bg-emerald-600 text-white shadow-sm'
                  : 'text-slate-600 dark:text-slate-400 hover:text-(--color-text) hover:bg-(--bg-card)'
              }`}
            >
              <span>Manual</span>
              <span
                className={`text-[10px] px-1.5 py-0.5 rounded-full font-mono ${
                  selectedTypeFilter === 'manual'
                    ? 'bg-white/20 text-white'
                    : 'bg-slate-200 dark:bg-white/10 text-slate-600 dark:text-slate-300'
                }`}
              >
                {manualBackupsCount}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setSelectedTypeFilter('archived')}
              className={`px-3 py-1.5 rounded-lg text-xs font-heading tracking-wider uppercase transition-all cursor-pointer font-bold flex items-center gap-1.5 shrink-0 ${
                selectedTypeFilter === 'archived'
                  ? 'bg-amber-600 text-white shadow-sm'
                  : 'text-slate-600 dark:text-slate-400 hover:text-(--color-text) hover:bg-(--bg-card)'
              }`}
            >
              <span>Archived</span>
              <span
                className={`text-[10px] px-1.5 py-0.5 rounded-full font-mono ${
                  selectedTypeFilter === 'archived'
                    ? 'bg-white/20 text-white'
                    : 'bg-slate-200 dark:bg-white/10 text-slate-600 dark:text-slate-300'
                }`}
              >
                {archivedBackupsCount}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setSelectedTypeFilter('all')}
              className={`px-3 py-1.5 rounded-lg text-xs font-heading tracking-wider uppercase transition-all cursor-pointer font-bold flex items-center gap-1.5 shrink-0 ${
                selectedTypeFilter === 'all'
                  ? 'bg-slate-700 text-white dark:bg-slate-600 shadow-sm'
                  : 'text-slate-600 dark:text-slate-400 hover:text-(--color-text) hover:bg-(--bg-card)'
              }`}
            >
              <span>All</span>
              <span
                className={`text-[10px] px-1.5 py-0.5 rounded-full font-mono ${
                  selectedTypeFilter === 'all'
                    ? 'bg-white/20 text-white'
                    : 'bg-slate-200 dark:bg-white/10 text-slate-600 dark:text-slate-300'
                }`}
              >
                {allBackupsCount}
              </span>
            </button>
          </div>

          {/* Search Input */}
          <div className="relative w-full md:max-w-xs">
            <input
              type="text"
              autoComplete="off"
              spellCheck={false}
              autoCorrect="off"
              value={mobileBackupSearch}
              onChange={(e) => setMobileBackupSearch(e.target.value)}
              placeholder="Search backups..."
              className="w-full pl-9 pr-4 py-2 border border-(--border-color) rounded-xl bg-(--bg-page) text-sm text-(--color-text) placeholder:text-slate-400 dark:placeholder:text-slate-500 outline-none focus:border-slate-400 transition-all font-medium"
            />
            <Database className="w-4 h-4 text-slate-400 dark:text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
          </div>
        </div>

        {/* Main Table (Desktop & Tablet) */}
        <div className="hidden sm:block p-1 rounded-2xl border border-(--border-color) bg-(--bg-card) overflow-x-auto lg:overflow-x-visible w-full">
          <Table<BackupItem>
            data={filteredBackups}
            columns={columns}
            searchKeys={['filename', 'notes']}
            searchPlaceholder="Search saved backups history..."
            defaultSortKey="created_at"
            defaultSortDirection="desc"
            itemsPerPage={responsiveItemsPerPage}
            loading={isLoading}
            loadingLabel="Loading backup records..."
          />
        </div>

        {/* Mobile Responsive Cards View */}
        <div className="block sm:hidden space-y-3">
          {isLoading ? (
            <div className="p-8 text-center text-xs text-slate-400 font-mono flex items-center justify-center gap-2 bg-(--bg-card) rounded-2xl border border-(--border-color)">
              <Loader2 className="w-4 h-4 animate-spin text-rose-500" />
              <span>Loading backup records...</span>
            </div>
          ) : mobileDisplayBackups.length === 0 ? (
            <div className="p-8 text-center text-xs text-slate-400 font-mono bg-(--bg-card) rounded-2xl border border-(--border-color)">
              No matching backup records found.
            </div>
          ) : (
            mobileDisplayBackups.map((b) => {
              const diffMs =
                new Date().getTime() - new Date(b.created_at).getTime();
              const diffMins = Math.floor(diffMs / (1000 * 60));
              const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
              const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

              let friendlyAge = 'Just now';
              if (diffMins >= 1 && diffMins < 60) {
                friendlyAge = `${diffMins} mins ago`;
              } else if (diffHours >= 1 && diffHours < 24) {
                friendlyAge = `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
              } else if (diffDays >= 1) {
                friendlyAge = `${diffDays} day${diffDays > 1 ? 's' : ''} ago`;
              }

              const dateObj = new Date(b.created_at);
              const phtTimeStr = dateObj.toLocaleTimeString('en-US', {
                timeZone: 'Asia/Manila',
                hour: 'numeric',
                minute: '2-digit',
                hour12: true,
              });
              const phtDateStr = dateObj.toLocaleDateString('en-US', {
                timeZone: 'Asia/Manila',
                month: 'short',
                day: 'numeric',
                year: 'numeric',
              });

              const isManualBackup = b.type === 'manual';
              const isArchived = b.type === 'archived';

              return (
                <div
                  key={b.id}
                  className="p-4 rounded-2xl border border-(--border-color) bg-(--bg-card) space-y-3 shadow-xs text-left"
                >
                  {/* Header: Icon, Date Title & PHT timestamp */}
                  <div className="flex items-start gap-3">
                    <div className="p-2.5 rounded-xl bg-red-500/10 text-red-500 border border-red-500/20 shrink-0">
                      <Database className="w-5 h-5" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <h4 className="text-sm font-bold text-(--color-text) truncate block">
                        Backup from {phtDateStr}
                      </h4>
                      <p className="text-[11px] text-slate-400 font-mono mt-0.5">
                        {phtTimeStr} (PHT)
                      </p>
                      {b.notes && (
                        <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 italic font-medium line-clamp-2">
                          "{b.notes}"
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Badges Row: TYPE, AGE, SIZE */}
                  <div className="flex items-center gap-2 flex-wrap pt-2 border-t border-(--border-color)">
                    {isArchived ? (
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 bg-amber-500/10 text-[9px] text-amber-500 border border-amber-500/20 rounded-full font-bold uppercase tracking-wider">
                        <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                        ARCHIVED
                      </span>
                    ) : isManualBackup ? (
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 bg-emerald-500/10 text-[9px] text-emerald-500 border border-emerald-500/20 rounded-full font-bold uppercase tracking-wider">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                        MANUAL
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 bg-blue-500/10 text-[9px] text-blue-500 border border-blue-500/20 rounded-full font-bold uppercase tracking-wider">
                        <span className="w-1.5 h-1.5 rounded-full bg-blue-500" />
                        AUTO
                      </span>
                    )}

                    <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-slate-100 dark:bg-white/5 rounded-full text-[10px] text-slate-500 dark:text-slate-400 font-medium">
                      <Calendar className="w-3 h-3 text-slate-400" />
                      {friendlyAge}
                    </span>

                    <span className="inline-flex items-center px-2 py-0.5 bg-slate-100 dark:bg-white/5 rounded-full text-[10px] text-slate-600 dark:text-slate-300 font-mono font-semibold">
                      {formatSize(b.size_bytes)}
                    </span>
                  </div>

                  {/* Actions Row */}
                  <div className="flex items-center justify-between gap-2 pt-2 border-t border-(--border-color)">
                    {b.type !== 'archived' ? (
                      <button
                        type="button"
                        onClick={() => handleArchiveBackup(b.id)}
                        className="flex-1 py-1.5 px-2 bg-amber-500/10 hover:bg-amber-500 text-amber-600 dark:text-amber-400 hover:text-white text-[10px] font-heading tracking-wider uppercase rounded-lg transition-all cursor-pointer font-bold border border-amber-500/20 flex items-center justify-center gap-1"
                      >
                        <Archive className="w-3.5 h-3.5" />
                        <span>Archive</span>
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => handleUnarchiveBackup(b.id)}
                        className="flex-1 py-1.5 px-2 bg-emerald-500/10 hover:bg-emerald-600 text-emerald-600 dark:text-emerald-400 hover:text-white text-[10px] font-heading tracking-wider uppercase rounded-lg transition-all cursor-pointer font-bold border border-emerald-500/20 flex items-center justify-center gap-1"
                      >
                        <Archive className="w-3.5 h-3.5 rotate-180" />
                        <span>Unarchive</span>
                      </button>
                    )}

                    <button
                      type="button"
                      disabled={!!safetyBackupPoint || !!activeSession}
                      onClick={() => handleRestoreClick(b)}
                      title={
                        activeSession
                          ? 'Cannot restore while a cash session is open'
                          : undefined
                      }
                      className="flex-1 py-1.5 px-3 bg-(--color-primary) hover:opacity-90 text-white text-[10px] font-heading tracking-wider uppercase rounded-lg transition-all cursor-pointer font-bold disabled:opacity-30 disabled:cursor-not-allowed shadow-xs text-center"
                    >
                      RESTORE
                    </button>

                    {b.type !== 'auto' && (
                      <button
                        type="button"
                        onClick={() => handleDeleteBackup(b)}
                        className="p-1.5 rounded-lg text-slate-400 hover:text-rose-500 hover:bg-rose-500/10 transition-colors cursor-pointer shrink-0"
                        title="Delete this backup"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Warning Box */}
        <div className="flex items-start gap-3 sm:gap-4 p-4 sm:p-5 bg-amber-500/10 dark:bg-amber-500/5 border border-amber-500/20 rounded-2xl text-xs text-amber-700 dark:text-amber-500 leading-normal max-w-full">
          <Info className="w-5 h-5 shrink-0 mt-0.5 text-amber-600 dark:text-amber-500" />
          <div className="space-y-1 text-left">
            <p className="font-heading tracking-wider uppercase text-xs text-amber-800 dark:text-amber-400 font-bold">
              Automated & Manual Backups Retention Rules
            </p>
            <p className="text-[11px] font-semibold text-slate-600 dark:text-slate-400 opacity-90 leading-relaxed">
              The system keeps up to 3 automated recovery snapshots (rotated
              daily), up to 5 manual backups, and up to 3 archived checkpoints
              stored safely in dedicated bucket storage to minimize storage
              usage.
            </p>
          </div>
        </div>
      </div>

      {/* MOBILE STICKY BOTTOM DOCK ABOVE NAVBAR */}
      {createPortal(
          <div
            style={{ position: 'fixed' }}
            className={`md:hidden fixed bottom-[calc(4.5rem+env(safe-area-inset-bottom,0px))] left-3 right-3 h-14 bg-(--bg-card)/95 backdrop-blur-xl border border-(--border-color) rounded-2xl flex items-center justify-between px-3.5 z-[195] shadow-2xl transition-all duration-300 ease-in-out ${
              isNavFloatingOpen
                ? 'translate-y-24 opacity-0 pointer-events-none'
                : 'translate-y-0 opacity-100 pointer-events-auto'
            }`}
          >
            <div className="flex items-center gap-2 text-xs font-heading font-bold text-(--color-text) select-none min-w-0 pr-2">
              <div className="flex items-center gap-1.5 text-blue-600 dark:text-blue-400 shrink-0">
                <Database className="w-3.5 h-3.5" />
                <span className="text-[11px]">{allBackupsCount} Backups</span>
              </div>
              <span className="text-slate-300 dark:text-zinc-700">•</span>
              <div className="flex items-center gap-1 text-slate-500 dark:text-slate-400 truncate">
                <span className="text-[11px] font-mono truncate">
                  {autoBackupsCount}/3 Auto
                </span>
              </div>
            </div>

            <div className="flex items-center gap-1.5 shrink-0">
              <button
                type="button"
                onClick={fetchBackups}
                disabled={isLoading}
                className="w-9 h-9 rounded-xl bg-(--bg-page) border border-(--border-color) text-slate-500 dark:text-slate-400 hover:text-(--color-text) flex items-center justify-center transition-all active:scale-95 cursor-pointer disabled:opacity-50"
                title="Refresh Backups"
              >
                <RefreshCw
                  className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`}
                />
              </button>

              <button
                type="button"
                disabled={!!activeSession}
                onClick={() => {
                  if (activeSession) {
                    toast.error(
                      'Please close the active cash session before saving a backup.'
                    );
                    return;
                  }
                  setIsCreateModalOpen(true);
                }}
                className="h-9 px-3.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white flex items-center justify-center gap-1.5 text-xs font-heading font-black tracking-wider uppercase shadow-md transition-all active:scale-95 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <PlusCircle className="w-4 h-4 shrink-0" />
                <span>SAVE BACKUP</span>
              </button>
            </div>
          </div>,
          document.body
        )}

      {/* Modal: Create Backup */}
      <Modal
        isOpen={isCreateModalOpen}
        onClose={() => {
          setIsCreateModalOpen(false);
          setBackupNotes('');
        }}
        title="Save Today's Backup Point"
      >
        <div className="space-y-4 font-body text-left">
          <p className="text-xs text-slate-600 dark:text-slate-300 leading-normal font-medium">
            Specify a custom note below to identify why this backup was created.
          </p>

          <div className="grid gap-1.5 pt-1">
            <label
              htmlFor="notesInput"
              className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300"
            >
              Backup Notes (Optional)
            </label>
            <input
              id="notesInput"
              type="text"
              autoComplete="off"
              spellCheck={false}
              autoCorrect="off"
              maxLength={120}
              placeholder="Write a custom description..."
              value={backupNotes}
              onChange={(e) => setBackupNotes(e.target.value)}
              className="w-full px-4 py-2.5 border border-(--border-color) rounded-lg text-sm bg-(--bg-page) text-(--color-text) placeholder:text-slate-400 dark:placeholder:text-slate-500 outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all font-medium"
            />
          </div>

          <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-3 pt-2">
            <Button
              variant="secondary"
              className="w-full sm:w-auto !py-2.5 !px-5 justify-center"
              onClick={() => {
                setIsCreateModalOpen(false);
                setBackupNotes('');
              }}
            >
              Cancel
            </Button>
            <Button
              onClick={handleCreateBackup}
              loading={isCreating}
              loadingLabel="SAVING SNAPSHOT..."
              className="w-full sm:w-auto !py-2.5 !px-5 justify-center !bg-emerald-600 text-white hover:!bg-emerald-700 font-heading text-xs tracking-wider uppercase shadow-md cursor-pointer !border-emerald-600"
            >
              Create Recovery Point
            </Button>
          </div>
        </div>
      </Modal>

      {/* Modal: Restore Backup */}
      <Modal
        isOpen={isRestoreModalOpen}
        onClose={() => {
          if (!isRestoring) {
            setIsRestoreModalOpen(false);
            setRestoreTarget(null);
            setVerifyPassword('');
          }
        }}
        title="Confirm System Restoration"
      >
        {restoreTarget && (
          <div className="space-y-4 font-body text-left">
            <div className="p-4 bg-red-500/10 dark:bg-red-500/5 border border-red-500/30 rounded-xl flex items-start gap-3.5 text-xs font-bold leading-snug">
              <ShieldAlert className="w-7 h-7 sm:w-8 sm:h-8 shrink-0 text-red-600 dark:text-red-500 mt-0.5" />
              <div className="space-y-1">
                <span className="block font-heading tracking-wider uppercase text-[10px] text-red-700 dark:text-red-400 font-extrabold">
                  CRITICAL RESTORE WARNING
                </span>
                <span className="block text-slate-700 dark:text-slate-300 font-medium leading-relaxed">
                  Restoring this backup will replace all current data. You will
                  be given a review period to verify or revert your changes
                  before they become permanent.
                </span>
              </div>
            </div>

            {activeSession && (
              <div className="p-3.5 bg-amber-500/10 dark:bg-amber-500/5 border border-amber-500/30 rounded-xl flex items-start gap-2.5 text-xs text-amber-700 dark:text-amber-400">
                <AlertTriangle className="w-4 h-4 shrink-0 text-amber-600 dark:text-amber-400 mt-0.5" />
                <span className="font-semibold leading-relaxed">
                  An active cash session is currently open. You must close the active cash session in Cash Management before restoring any database backup.
                </span>
              </div>
            )}

            <div className="space-y-2">
              <p className="text-xs text-slate-600 dark:text-slate-300 leading-normal font-semibold">
                This process will restore the database to its state on:
              </p>
              <strong className="block text-xs text-(--color-text) font-bold bg-(--bg-page) p-3 rounded-lg border border-(--border-color)">
                {new Date(restoreTarget.created_at).toLocaleDateString(
                  'en-US',
                  {
                    month: 'long',
                    day: 'numeric',
                    year: 'numeric',
                    timeZone: 'Asia/Manila',
                  }
                )}{' '}
                at{' '}
                {new Date(restoreTarget.created_at).toLocaleTimeString(
                  'en-US',
                  {
                    hour: 'numeric',
                    minute: '2-digit',
                    hour12: true,
                    timeZone: 'Asia/Manila',
                  }
                )}{' '}
                (PHT)
              </strong>
            </div>

            {hasPassword ? (
              <div className="grid gap-1.5 pt-1">
                <label
                  htmlFor="verifyPasswordInput"
                  className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-200 flex items-center gap-1.5"
                >
                  <Lock className="w-3.5 h-3.5 text-red-600 dark:text-red-500" />
                  Confirm Admin Password
                </label>
                <input
                  id="verifyPasswordInput"
                  type="password"
                  autoComplete="off"
                  spellCheck={false}
                  autoCorrect="off"
                  disabled={isRestoring}
                  placeholder="Enter your password to authorize rollback..."
                  value={verifyPassword}
                  onChange={(e) => setVerifyPassword(e.target.value)}
                  className="w-full px-4 py-2.5 border border-(--border-color) rounded-lg text-sm bg-(--bg-page) text-(--color-text) placeholder:text-slate-400 dark:placeholder:text-slate-500 outline-none focus:ring-2 focus:ring-red-500/20 focus:border-red-500 transition-all font-medium disabled:opacity-50"
                />
              </div>
            ) : (
              <div className="space-y-2 pt-1">
                <div className="p-2.5 bg-blue-500/10 border border-blue-500/20 rounded-xl text-xs text-blue-600 dark:text-blue-400 flex items-center justify-between gap-2">
                  <span className="font-semibold truncate">
                    Signed in via Google ({user?.email})
                  </span>
                  <span className="text-[10px] uppercase font-mono font-bold bg-blue-500/20 px-2 py-0.5 rounded shrink-0">
                    Verified OAuth
                  </span>
                </div>
                <label
                  htmlFor="restoreConfirmPhraseInput"
                  className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-200 block"
                >
                  Safety Confirmation Phrase *
                </label>
                <input
                  id="restoreConfirmPhraseInput"
                  type="text"
                  autoComplete="off"
                  spellCheck={false}
                  autoCorrect="off"
                  disabled={isRestoring}
                  value={restoreConfirmText}
                  onChange={(e) => setRestoreConfirmText(e.target.value)}
                  placeholder='Type "CONFIRM RESTORE" to proceed'
                  className="w-full px-4 py-2.5 border border-(--border-color) rounded-lg text-sm bg-(--bg-page) text-(--color-text) placeholder:text-slate-400 dark:placeholder:text-slate-500 outline-none focus:ring-2 focus:ring-red-500/20 focus:border-red-500 transition-all font-mono uppercase font-semibold disabled:opacity-50"
                />
                <p className="text-[10px] text-slate-500">
                  Because this account uses Google Sign-In with no local password, typing <strong className="text-(--color-text)">CONFIRM RESTORE</strong> authorizes this critical database restoration.
                </p>
              </div>
            )}

            <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-3 pt-2">
              <Button
                variant="secondary"
                disabled={isRestoring}
                className="w-full sm:w-auto !py-2.5 !px-5 justify-center text-xs font-heading tracking-wider"
                onClick={() => {
                  setIsRestoreModalOpen(false);
                  setRestoreTarget(null);
                  setVerifyPassword('');
                  setRestoreConfirmText('');
                }}
              >
                Cancel
              </Button>
              <Button
                variant="danger"
                onClick={handleConfirmRestore}
                loading={isRestoring}
                disabled={
                  countdown > 0 ||
                  isRestoring ||
                  !!activeSession ||
                  (hasPassword
                    ? !verifyPassword.trim()
                    : restoreConfirmText.trim().toUpperCase() !== 'CONFIRM RESTORE')
                }
                loadingLabel="RESTORING SYSTEM..."
                className={`w-full sm:w-auto !py-2.5 !px-5 justify-center font-heading text-xs tracking-wider uppercase shadow-md transition-colors ${
                  countdown > 0 ||
                  isRestoring ||
                  !!activeSession ||
                  (hasPassword
                    ? !verifyPassword.trim()
                    : restoreConfirmText.trim().toUpperCase() !== 'CONFIRM RESTORE')
                    ? '!bg-slate-200 !border-slate-300 !text-slate-500 dark:!bg-zinc-800 dark:!border-zinc-700 dark:!text-zinc-400 cursor-not-allowed'
                    : '!bg-red-600 hover:!bg-red-700 !border-red-600 !text-white cursor-pointer'
                }`}
              >
                {isRestoring
                  ? 'Restoring system...'
                  : countdown > 0
                    ? `Confirm Restore (${countdown}s)`
                    : 'Confirm Restore'}
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
};

export default DatabaseBackup;
