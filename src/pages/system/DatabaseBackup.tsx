// src/pages/system/DatabaseBackup.tsx
import React, { useState, useRef, useEffect, useMemo } from 'react';
import { supabase } from '../../lib/supabase/client';
import { logAudit } from '../../lib/supabase/audit';
import { clearAppCaches } from '../../lib/cacheUtils';
import { useBackupSafetyStore } from '../../stores/useBackupSafetyStore';
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
  CheckCircle2,
  Calendar,
  Info,
  MoreVertical,
  Archive,
  PlusCircle,
  Lock,
  ArrowLeftRight,
  Undo2,
  ShieldCheck,
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
  const [activeDropdownId, setActiveDropdownId] = useState<string | null>(null);
  const [selectedTypeFilter, setSelectedTypeFilter] = useState<string>('auto');

  // Manual Backup Dialog State
  const [isCreateModalOpen, setIsCreateModalOpen] = useState<boolean>(false);
  const [backupNotes, setBackupNotes] = useState<string>('');

  // Restore Modal State
  const [isRestoreModalOpen, setIsRestoreModalOpen] = useState<boolean>(false);
  const [restoreTarget, setRestoreTarget] = useState<BackupItem | null>(null);
  const [isRestoring, setIsRestoring] = useState<boolean>(false);
  const [countdown, setCountdown] = useState<number>(3);
  const [verifyPassword, setVerifyPassword] = useState<string>('');

  // Global Safety Store state hook
  const safetyBackup = useBackupSafetyStore((s) => s?.safetyBackup ?? null);
  const isVerifying = useBackupSafetyStore((s) => s?.isVerifying ?? false);
  const revertRestoration = useBackupSafetyStore((s) => s?.revertRestoration);
  const commitRestoration = useBackupSafetyStore((s) => s?.commitRestoration);
  const fetchSafetyBackup = useBackupSafetyStore((s) => s?.fetchSafetyBackup);

  const dropdownRef = useRef<HTMLDivElement | null>(null);

  const fetchBackups = async () => {
    try {
      setIsLoading(true);
      const { data, error } = await supabase
        .from('database_backups')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setBackups((data as BackupItem[]) || []);
      return data as BackupItem[];
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

  const checkAndTriggerDailyAutoBackup = async (currentList: BackupItem[]) => {
    try {
      const todayDateStr = new Date().toISOString().slice(0, 10);
      const hasAutoToday = currentList.some(
        (b) => b.type === 'auto' && b.created_at.slice(0, 10) === todayDateStr
      );

      if (hasAutoToday) return;

      const autoBackups = currentList
        .filter((b) => b.type === 'auto')
        .sort(
          (a, b) =>
            new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
        );

      if (autoBackups.length >= 7) {
        const toRemove = autoBackups.slice(0, autoBackups.length - 6);
        const filenamesToRemove = toRemove.map((b) => b.filename);
        const idsToRemove = toRemove.map((b) => b.id);

        await supabase.storage.from('backups').remove(filenamesToRemove);
        await supabase.from('database_backups').delete().in('id', idsToRemove);
      }

      const { data: dumpPayload, error: dumpErr } = await supabase.rpc(
        'export_database_dump'
      );
      if (dumpErr || !dumpPayload) return;

      const timestamp = Date.now();
      const filename = `auto_${timestamp}.json`;
      const jsonBlob = new Blob([JSON.stringify(dumpPayload, null, 2)], {
        type: 'application/json',
      });

      const { error: uploadError } = await supabase.storage
        .from('backups')
        .upload(filename, jsonBlob, { contentType: 'application/json' });
      if (uploadError) return;

      await supabase.from('database_backups').insert({
        filename,
        notes: 'Daily Automated Backup',
        type: 'auto',
        size_bytes: jsonBlob.size,
      });

      fetchBackups();
    } catch (err) {
      console.error('Silent auto-backup error:', err);
    }
  };

  useEffect(() => {
    fetchBackups().then((loaded) => {
      if (loaded && loaded.length >= 0) {
        checkAndTriggerDailyAutoBackup(loaded);
      }
    });
    if (fetchSafetyBackup) {
      fetchSafetyBackup();
    }
  }, []);

  useEffect(() => {
    if (!isRestoreModalOpen) return;
    setCountdown(3);
    setVerifyPassword('');
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

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node)
      ) {
        setActiveDropdownId(null);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleCreateBackup = async () => {
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

      const { error: uploadError } = await supabase.storage
        .from('backups')
        .upload(filename, jsonBlob, { contentType: 'application/json' });
      if (uploadError) throw uploadError;

      const { error: insertError } = await supabase
        .from('database_backups')
        .insert({
          filename,
          notes: customNoteText,
          type: 'manual',
          size_bytes: jsonBlob.size,
        });
      if (insertError) throw insertError;

      await logAudit(
        'DATABASE_BACKUP_CREATED',
        `Created manual database backup checkpoint: "${customNoteText}".`
      );

      toast.success('Backup saved to storage successfully.');
      setIsCreateModalOpen(false);
      setBackupNotes('');
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
      setActiveDropdownId(null);
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
      setActiveDropdownId(null);
      fetchBackups();
    } catch (err: any) {
      toast.error(err?.message || 'Failed to unarchive backup.');
    }
  };

  const handleRestoreClick = (backup: BackupItem) => {
    setRestoreTarget(backup);
    setIsRestoreModalOpen(true);
  };

  const handleConfirmRestore = async () => {
    if (!restoreTarget) return;

    if (!verifyPassword.trim()) {
      toast.error('Please enter your password to authorize this action.');
      return;
    }

    try {
      setIsRestoring(true);

      const { data: isValidPassword, error: authError } = await supabase.rpc(
        'verify_user_password',
        { entered_password: verifyPassword }
      );

      if (authError || !isValidPassword) {
        throw new Error('Authorization failed. Incorrect password.');
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

      const safetyFilename = `safety_${Date.now()}.json`;
      const safetyBlob = new Blob([JSON.stringify(currentDump, null, 2)], {
        type: 'application/json',
      });

      await supabase.storage
        .from('backups')
        .upload(safetyFilename, safetyBlob, {
          contentType: 'application/json',
        });

      await supabase.from('database_backups').insert({
        filename: safetyFilename,
        notes: 'Pre-Restore Backup (Auto-Safety)',
        type: 'safety',
        size_bytes: safetyBlob.size,
      });

      toast.info('Downloading backup file...');
      const { data: fileBlob, error: downloadError } = await supabase.storage
        .from('backups')
        .download(restoreTarget.filename);

      if (downloadError || !fileBlob) {
        throw new Error(
          `Failed to download backup file: ${downloadError?.message}`
        );
      }

      const backupJson = JSON.parse(await fileBlob.text());

      toast.info('Restoring database snapshot...');
      const { error: restoreError } = await supabase.rpc(
        'restore_database_from_payload',
        { backup_payload: backupJson }
      );
      if (restoreError) throw restoreError;

      // Invalidate app runtime caches
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

  const manualBackupsCount = backups.filter((b) => b.type === 'manual').length;
  const autoBackupsCount = backups.filter((b) => b.type === 'auto').length;
  const archivedBackupsCount = backups.filter(
    (b) => b.type === 'archived'
  ).length;
  const totalFilteredCount = filteredBackups.length;

  const kpiConfig = useMemo(() => {
    switch (selectedTypeFilter) {
      case 'auto':
        return {
          kpi1: {
            title: 'AUTOMATED DAILY FILES',
            value: `${autoBackupsCount} / 7`,
            subtext: 'Active daily rotation slots',
            colorClass:
              'bg-blue-500/10 text-blue-600 dark:text-blue-500 border-blue-500/20',
            icon: (
              <RefreshCw className="w-6 h-6 text-blue-600 dark:text-blue-400" />
            ),
          },
          kpi2: {
            title: 'ROTATION PERIOD',
            value: '7 DAY CYCLE',
            subtext: 'One snapshot saved daily',
            colorClass:
              'bg-slate-500/10 text-slate-600 dark:text-slate-400 border-slate-500/20',
            icon: (
              <Calendar className="w-6 h-6 text-slate-600 dark:text-slate-400" />
            ),
          },
          kpi3: {
            title: 'RETENTION POLICY',
            value: 'AUTO-DELETE',
            subtext: 'Oldest rotated out at limit',
            colorClass:
              'bg-blue-500/10 text-blue-600 dark:text-blue-500 border-blue-500/20',
            icon: (
              <CheckCircle2 className="w-6 h-6 text-blue-600 dark:text-blue-400" />
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
        });
        const timeStr = dateObj.toLocaleTimeString('en-US', {
          hour: 'numeric',
          minute: '2-digit',
          hour12: true,
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
                  {timeStr}
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
        <div className="flex items-center justify-end gap-2 sm:gap-3.5 relative">
          <button
            disabled={!!safetyBackupPoint}
            onClick={() => handleRestoreClick(b)}
            className="px-3 py-1.5 sm:px-3.5 bg-(--color-primary)/10 hover:bg-(--color-primary) text-(--color-primary) dark:text-(--color-primary-light) hover:text-white text-[10px] font-heading tracking-wider uppercase rounded-lg transition-all cursor-pointer font-bold border border-(--color-primary)/20 disabled:opacity-30 disabled:cursor-not-allowed whitespace-nowrap"
          >
            RESTORE
          </button>

          <div className="relative">
            <button
              onClick={() =>
                setActiveDropdownId(activeDropdownId === b.id ? null : b.id)
              }
              className="p-1.5 text-slate-500 hover:text-(--color-text) rounded-lg hover:bg-(--bg-input) transition-colors cursor-pointer"
              title="Backup Options"
              aria-label="Toggle backup options menu"
            >
              <MoreVertical className="w-4.5 h-4.5" />
            </button>

            {activeDropdownId === b.id && (
              <div
                ref={dropdownRef}
                className="absolute right-0 mt-1.5 w-44 bg-(--bg-card) border border-(--border-color) rounded-xl shadow-2xl z-50 py-1.5 text-left animate-slide-up"
              >
                {b.type !== 'archived' ? (
                  <button
                    onClick={() => handleArchiveBackup(b.id)}
                    className="w-full px-3.5 py-2 hover:bg-(--bg-input) text-slate-700 dark:text-(--color-text) dark:opacity-85 hover:opacity-100 text-xs font-semibold flex items-center gap-2.5 transition-colors cursor-pointer"
                  >
                    <Archive className="w-4 h-4 text-amber-500" />
                    Archive Backup
                  </button>
                ) : (
                  <button
                    onClick={() => handleUnarchiveBackup(b.id)}
                    className="w-full px-3.5 py-2 hover:bg-(--bg-input) text-slate-700 dark:text-(--color-text) dark:opacity-85 hover:opacity-100 text-xs font-semibold flex items-center gap-2.5 transition-colors cursor-pointer"
                  >
                    <Archive className="w-4 h-4 text-emerald-500 dark:text-emerald-400 rotate-180" />
                    Unarchive Backup
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6 sm:space-y-8 font-body min-h-screen text-(--color-text) rounded-3xl">
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

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-heading tracking-widest uppercase text-(--color-text)">
            SYSTEM BACKUPS
          </h2>
          <p className="text-sm text-slate-600 dark:text-slate-400 mt-1 font-medium">
            Create and manage backups stored in dedicated object storage.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => setIsCreateModalOpen(true)}
            className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-emerald-600 text-white hover:bg-emerald-700 text-[10px] font-heading tracking-widest uppercase rounded-lg transition-all cursor-pointer shadow-lg shadow-emerald-600/10"
          >
            <PlusCircle className="w-3.5 h-3.5" />
            SAVE TODAY'S BACKUP
          </button>
        </div>
      </div>

      {/* Dynamic KPI Widgets */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-5">
        <div className="p-4 sm:p-5 bg-(--bg-card) border border-(--border-color) rounded-2xl flex items-center gap-4">
          <div className={`p-3 rounded-xl border ${kpiConfig.kpi1.colorClass}`}>
            {kpiConfig.kpi1.icon}
          </div>
          <div className="space-y-1.5 flex-1 min-w-0">
            <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider block truncate">
              {kpiConfig.kpi1.title}
            </span>
            {isLoading ? (
              <div className="h-6 w-20 bg-slate-200 dark:bg-white/10 rounded animate-pulse mt-0.5" />
            ) : (
              <span className="text-lg font-extrabold text-(--color-text) font-heading tracking-wide mt-0.5 block animate-fade-in">
                {kpiConfig.kpi1.value}
              </span>
            )}
            {isLoading ? (
              <div className="h-3 w-32 bg-slate-100 dark:bg-white/5 rounded animate-pulse mt-1" />
            ) : (
              <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 block mt-0.5 animate-fade-in truncate">
                {kpiConfig.kpi1.subtext}
              </span>
            )}
          </div>
        </div>

        <div className="p-4 sm:p-5 bg-(--bg-card) border border-(--border-color) rounded-2xl flex items-center gap-4">
          <div className={`p-3 rounded-xl border ${kpiConfig.kpi2.colorClass}`}>
            {kpiConfig.kpi2.icon}
          </div>
          <div className="space-y-1.5 flex-1 min-w-0">
            <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider block truncate">
              {kpiConfig.kpi2.title}
            </span>
            {isLoading ? (
              <div className="h-6 w-20 bg-slate-200 dark:bg-white/10 rounded animate-pulse mt-0.5" />
            ) : (
              <span className="text-lg font-extrabold text-(--color-text) font-heading tracking-wider mt-0.5 block animate-fade-in">
                {kpiConfig.kpi2.value}
              </span>
            )}
            {isLoading ? (
              <div className="h-3 w-32 bg-slate-100 dark:bg-white/5 rounded animate-pulse mt-1" />
            ) : (
              <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 block mt-0.5 animate-fade-in truncate">
                {kpiConfig.kpi2.subtext}
              </span>
            )}
          </div>
        </div>

        <div className="p-4 sm:p-5 bg-(--bg-card) border border-(--border-color) rounded-2xl flex items-center gap-4 sm:col-span-2 lg:col-span-1">
          <div className={`p-3 rounded-xl border ${kpiConfig.kpi3.colorClass}`}>
            {kpiConfig.kpi3.icon}
          </div>
          <div className="space-y-1.5 flex-1 min-w-0">
            <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider block truncate">
              {kpiConfig.kpi3.title}
            </span>
            {isLoading ? (
              <div className="h-6 w-20 bg-slate-200 dark:bg-white/10 rounded animate-pulse mt-0.5" />
            ) : (
              <span className="text-lg font-extrabold text-(--color-text) font-heading tracking-wider mt-0.5 block animate-fade-in">
                {kpiConfig.kpi3.value}
              </span>
            )}
            {isLoading ? (
              <div className="h-3 w-32 bg-slate-100 dark:bg-white/5 rounded animate-pulse mt-1" />
            ) : (
              <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 block mt-0.5 animate-fade-in truncate">
                {kpiConfig.kpi3.subtext}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Filter and Search */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4 bg-(--bg-card) p-3 sm:p-4 rounded-2xl border border-(--border-color)">
        <div className="relative w-full sm:max-w-md">
          <input
            type="text"
            placeholder="Search backups..."
            className="w-full pl-10 pr-4 py-2 border border-(--border-color) rounded-xl bg-(--bg-page) text-sm text-(--color-text) placeholder:text-slate-400 dark:placeholder:text-slate-500 outline-none focus:border-slate-400 transition-all font-medium"
          />
          <Database className="w-4 h-4 text-slate-400 dark:text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
        </div>

        <div className="flex items-center justify-between sm:justify-end gap-2 w-full sm:w-auto">
          <span className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
            Filter:
          </span>
          <select
            value={selectedTypeFilter}
            onChange={(e) => setSelectedTypeFilter(e.target.value)}
            title="Filter backups by type"
            aria-label="Filter backups by type"
            className="flex-1 sm:flex-none px-3.5 py-2 bg-(--bg-page) border border-(--border-color) rounded-xl text-xs text-(--color-text) font-semibold outline-none focus:border-slate-400 transition-all cursor-pointer"
          >
            <option value="all">All Types</option>
            <option value="manual">Manual Backups</option>
            <option value="auto">Automated Backups</option>
            <option value="archived">Archived Backups</option>
          </select>
        </div>
      </div>

      {/* Main Table */}
      <div className="p-1 rounded-2xl border border-(--border-color) bg-(--bg-card) overflow-x-auto lg:overflow-x-visible w-full">
        <Table<BackupItem>
          data={filteredBackups}
          columns={columns}
          searchKeys={['filename', 'notes']}
          searchPlaceholder="Search saved backups history..."
          defaultSortKey="created_at"
          defaultSortDirection="desc"
          itemsPerPage={useResponsiveItemsPerPage()}
          loading={isLoading}
          loadingLabel="Loading backup records..."
        />
      </div>

      {/* Warning Box */}
      <div className="flex items-start gap-3 sm:gap-4 p-4 sm:p-5 bg-amber-500/10 dark:bg-amber-500/5 border border-amber-500/20 rounded-2xl text-xs text-amber-700 dark:text-amber-500 leading-normal max-w-full">
        <Info className="w-5 h-5 shrink-0 mt-0.5 text-amber-600 dark:text-amber-500" />
        <div className="space-y-1 text-left">
          <p className="font-heading tracking-wider uppercase text-xs text-amber-800 dark:text-amber-400 font-bold">
            Automated & Manual Backups Retention Rules
          </p>
          <p className="text-[11px] font-semibold text-slate-600 dark:text-slate-400 opacity-90 leading-relaxed">
            The system keeps up to 7 automated recovery snapshots, up to 5
            manual backups, and up to 3 archived checkpoints stored safely in
            dedicated bucket storage.
          </p>
        </div>
      </div>

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
                  }
                )}{' '}
                at{' '}
                {new Date(restoreTarget.created_at).toLocaleTimeString(
                  'en-US',
                  {
                    hour: 'numeric',
                    minute: '2-digit',
                    hour12: true,
                  }
                )}
              </strong>
            </div>

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
                disabled={isRestoring}
                placeholder="Enter your password to authorize rollback..."
                value={verifyPassword}
                onChange={(e) => setVerifyPassword(e.target.value)}
                className="w-full px-4 py-2.5 border border-(--border-color) rounded-lg text-sm bg-(--bg-page) text-(--color-text) placeholder:text-slate-400 dark:placeholder:text-slate-500 outline-none focus:ring-2 focus:ring-red-500/20 focus:border-red-500 transition-all font-medium disabled:opacity-50"
              />
            </div>

            <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-3 pt-2">
              <Button
                variant="secondary"
                disabled={isRestoring}
                className="w-full sm:w-auto !py-2.5 !px-5 justify-center text-xs font-heading tracking-wider"
                onClick={() => {
                  setIsRestoreModalOpen(false);
                  setRestoreTarget(null);
                  setVerifyPassword('');
                }}
              >
                Cancel
              </Button>
              <Button
                variant="danger"
                onClick={handleConfirmRestore}
                loading={isRestoring}
                disabled={
                  countdown > 0 || isRestoring || !verifyPassword.trim()
                }
                loadingLabel="RESTORING SYSTEM..."
                className={`w-full sm:w-auto !py-2.5 !px-5 justify-center font-heading text-xs tracking-wider uppercase shadow-md transition-colors ${
                  countdown > 0 || !verifyPassword.trim()
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
