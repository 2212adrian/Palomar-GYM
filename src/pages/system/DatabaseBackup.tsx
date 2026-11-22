// src/pages/system/DatabaseBackup.tsx
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { supabase } from '../../lib/supabase/client';
import { logAudit } from '../../lib/supabase/audit';
import { clearAppCaches } from '../../lib/cacheUtils';
import { useBackupSafetyStore } from '../../stores/useBackupSafetyStore';
import { useAuthStore } from '../../stores/authStore';
import { isSuperAdmin } from '../../constants/auth';
import { useCashSessionStore } from '../../stores/useCashSessionStore';
import { useNavbarStore } from '../../stores/useNavbarStore';
import { createPortal } from 'react-dom';
import { saveAs } from 'file-saver';
import { Table } from '../../components/ui/Table';
import { Modal } from '../../components/ui/Modal';
import { Button } from '../../components/ui/Button';
import type { Column } from '../../components/ui/Table';
import { useResponsiveItemsPerPage } from '../../lib/useResponsiveItemsPerPage';
import { toast } from 'react-toastify';
import {
  exportEncryptedDatabaseCsv,
  decryptAndValidateEncryptedBackup,
  executeValidatedEncryptedImport,
  type DecryptedValidatedBackup,
} from './utils/encryptedCsvBackup';
import type { DuplicateAction } from './utils/csvDataMigration';
import defaultLogo from '../../assets/icon.png';
import {
  Database,
  ShieldAlert,
  RefreshCw,
  Calendar,
  CalendarDays,
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
  Download,
  Upload,
  FileLock2,
  CheckCircle2,
  XCircle,
  Eye,
  Search,
  Building,
  Target,
  Clock,
  Trophy,
  CreditCard,
  Smartphone,
  Percent,
  User,
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

  // Backup Relevance & Contents Inspector Modal State
  const [inspectTarget, setInspectTarget] = useState<BackupItem | null>(null);
  const [inspectPayload, setInspectPayload] = useState<Record<string, any[]> | null>(null);
  const [isInspectLoading, setIsInspectLoading] = useState<boolean>(false);
  const [inspectError, setInspectError] = useState<string | null>(null);
  const [selectedInspectTable, setSelectedInspectTable] = useState<string>('sales');
  const [inspectSearch, setInspectSearch] = useState<string>('');

  // Restore Modal State
  const [isRestoreModalOpen, setIsRestoreModalOpen] = useState<boolean>(false);
  const [restoreTarget, setRestoreTarget] = useState<BackupItem | null>(null);
  const [isRestoring, setIsRestoring] = useState<boolean>(false);
  const [countdown, setCountdown] = useState<number>(3);
  const [verifyPassword, setVerifyPassword] = useState<string>('');
  const [restoreConfirmText, setRestoreConfirmText] = useState<string>('');

  // Encrypted Export / Import Data State (Re-auth required)
  const encryptedFileInputRef = useRef<HTMLInputElement>(null);
  const [isExportModalOpen, setIsExportModalOpen] = useState<boolean>(false);
  const [exportPassword, setExportPassword] = useState<string>('');
  const [isExportingData, setIsExportingData] = useState<boolean>(false);

  const [isImportModalOpen, setIsImportModalOpen] = useState<boolean>(false);
  const [importFilename, setImportFilename] = useState<string>('');
  const [importPreview, setImportPreview] =
    useState<DecryptedValidatedBackup | null>(null);
  const [importResolutions, setImportResolutions] = useState<
    Record<string, DuplicateAction>
  >({});
  const [importParseError, setImportParseError] = useState<string | null>(null);
  const [importPassword, setImportPassword] = useState<string>('');
  const [isDecodingImport, setIsDecodingImport] = useState<boolean>(false);
  const [isImportingData, setIsImportingData] = useState<boolean>(false);
  const [importProgress, setImportProgress] = useState<{
    percent: number;
    label: string;
  } | null>(null);

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

  const HIDDEN_BACKUP_OVERVIEW_TABLES = new Set([
    'app_releases',
    'audit_logs',
    'online_registrations',
    'gym_profile',
    'gym_profile_settings',
    'migration_audit_logs',
    'receipts',
    'sync_conflicts',
    'system_config',
    'system_config_flags',
    'revenue_goals',
    'rates_config',
    'rates_payments_config',
  ]);

  const BACKUP_TABLE_LABELS: Record<string, { label: string; group: string }> = {
    sales: { label: 'Sales & POS Records', group: 'Core' },
    attendance: { label: 'Logbook & Check-Ins', group: 'Core' },
    members: { label: 'Member List', group: 'Core' },
    products: { label: 'Product List & Stock', group: 'Core' },
    stock_movements: { label: 'Stock Movements', group: 'Core' },
    subscriptions: { label: 'Subscriptions & Plans', group: 'Core' },
    cash_sessions: { label: 'Cash Drawer Sessions', group: 'Ledger' },
    cash_transactions: { label: 'Cash In / Out Movements', group: 'Ledger' },
    cards: { label: 'Physical NFC / QR Cards', group: 'Operations' },
    member_cards: { label: 'Assigned Member Cards', group: 'Operations' },
    profiles: { label: 'Staff Profiles & Roles', group: 'System' },
    incident_reports: { label: 'Incident Reports', group: 'Operations' },
  };

  const PRIORITY_INSPECT_TABLES = [
    'sales',
    'attendance',
    'members',
    'products',
    'stock_movements',
    'subscriptions',
    'cash_sessions',
    'cash_transactions',
    'member_cards',
    'cards',
    'incident_reports',
    'profiles',
  ];

  const EXCLUDED_IMPORTANT_ITEMS = [
    {
      title: 'Auth Logins & Passwords (auth.users)',
      reason: 'Managed directly by Supabase Auth; not stored inside public table JSON snapshots.',
    },
    {
      title: 'Uploaded Avatars & Logos (Storage)',
      reason: 'Image blobs and stored backup files live in object storage buckets rather than table rows.',
    },
    {
      title: 'Backup Archive Index (database_backups)',
      reason: 'Skipped intentionally to prevent recursive snapshots inside each backup file.',
    },
    {
      title: 'Unsynced Offline Browser Vault',
      reason: 'Pending offline entries on a device are not included until synced to Supabase.',
    },
  ];

  const handleInspectBackup = async (backup: BackupItem) => {
    setInspectTarget(backup);
    setInspectPayload(null);
    setInspectError(null);
    setInspectSearch('');
    setIsInspectLoading(true);

    try {
      let rawPayload: any = null;

      const { data: dbRow } = await supabase
        .from('database_backups')
        .select('*')
        .eq('id', backup.id)
        .maybeSingle();

      const candidatePayload =
        dbRow?.payload ?? (dbRow as any)?.backup_data ?? null;

      if (candidatePayload) {
        rawPayload =
          typeof candidatePayload === 'string'
            ? JSON.parse(candidatePayload)
            : candidatePayload;
      } else if (backup.filename) {
        const { data: blobData, error: storageErr } = await supabase.storage
          .from('backups')
          .download(backup.filename);
        if (storageErr) throw storageErr;
        if (blobData) {
          const text = await blobData.text();
          rawPayload = JSON.parse(text);
        }
      }

      if (!rawPayload || typeof rawPayload !== 'object') {
        throw new Error('Backup snapshot payload is empty or unavailable.');
      }

      const normalized: Record<string, any[]> = {};
      Object.entries(rawPayload).forEach(([key, val]) => {
        if (Array.isArray(val)) {
          normalized[key] = val;
        }
      });

      setInspectPayload(normalized);

      const visibleKeys = Object.keys(normalized).filter(
        (k) => !HIDDEN_BACKUP_OVERVIEW_TABLES.has(k)
      );
      const firstPopulated =
        PRIORITY_INSPECT_TABLES.find(
          (k) =>
            !HIDDEN_BACKUP_OVERVIEW_TABLES.has(k) &&
            normalized[k] &&
            normalized[k].length > 0
        ) ||
        visibleKeys.find((k) => normalized[k].length > 0) ||
        visibleKeys[0] ||
        'sales';
      setSelectedInspectTable(firstPopulated);
    } catch (err: any) {
      setInspectError(
        err?.message || 'Unable to load backup contents for preview.'
      );
    } finally {
      setIsInspectLoading(false);
    }
  };

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
        <div
          className="flex items-center justify-end gap-2 sm:gap-2.5"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Open Backup Overview */}
          <button
            type="button"
            onClick={() => handleInspectBackup(b)}
            className="px-2.5 py-1.5 bg-blue-500/10 hover:bg-blue-600 text-blue-600 dark:text-blue-400 hover:text-white text-[10px] font-heading tracking-wider uppercase rounded-lg transition-all cursor-pointer font-bold border border-blue-500/20 whitespace-nowrap flex items-center gap-1"
            title="Open Backup Overview"
          >
            <Eye className="w-3.5 h-3.5" />
            <span>View</span>
          </button>

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

  const handleConfirmEncryptedExport = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isSuperAdminOnly) return;
    if (!hasPassword) {
      toast.error(
        'Password re-authentication is required. Please set an account password in Personal Account first.'
      );
      return;
    }
    if (!exportPassword.trim()) {
      toast.error('Please enter your account password to export data.');
      return;
    }

    setIsExportingData(true);
    try {
      const { data: isValidPassword, error: authErr } = await supabase.rpc(
        'verify_user_password',
        { entered_password: exportPassword }
      );
      if (authErr || !isValidPassword) {
        throw new Error('Authentication failed. Incorrect account password.');
      }

      const exported = await exportEncryptedDatabaseCsv({
        actorId: user?.id,
        actorEmail: user?.email || profile?.email,
      });

      const blob = new Blob([exported.encryptedContent], {
        type: 'application/octet-stream',
      });
      saveAs(blob, exported.filename);

      toast.success(
        `Encrypted backup exported (${exported.productsCount} products, ${exported.membersCount} members).`
      );
      setIsExportModalOpen(false);
      setExportPassword('');
    } catch (err: any) {
      toast.error(err?.message || 'Failed to export encrypted backup.');
    } finally {
      setIsExportingData(false);
    }
  };

  const handleEncryptedImportFileChange = async (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';

    setImportFilename(file.name);
    setImportPreview(null);
    setImportParseError(null);
    setImportResolutions({});
    setImportPassword('');
    setIsImportModalOpen(true);
    setIsDecodingImport(true);

    try {
      const text = await file.text();
      const validated = await decryptAndValidateEncryptedBackup(text);
      setImportPreview(validated);
      setImportResolutions({ ...validated.parsed.defaultResolutions });
    } catch (err: any) {
      setImportParseError(
        err?.message || 'Failed to decrypt or validate encrypted backup file.'
      );
    } finally {
      setIsDecodingImport(false);
    }
  };

  const handleConfirmEncryptedImport = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isSuperAdminOnly || !importPreview) return;

    if (activeSession) {
      toast.error(
        'Cannot import data while a cash session is open. Close the cash drawer first.'
      );
      return;
    }
    if (!hasPassword) {
      toast.error(
        'Password re-authentication is required. Please set an account password in Personal Account first.'
      );
      return;
    }
    if (!importPassword.trim()) {
      toast.error('Please enter your account password to authorize import.');
      return;
    }
    if (!importPreview.parsed.isValid || importPreview.parsed.errorCount > 0) {
      toast.error(
        'Backup contains validation errors and cannot be imported until resolved.'
      );
      return;
    }

    setIsImportingData(true);
    setImportProgress({ percent: 2, label: 'Verifying account password...' });
    try {
      const { data: isValidPassword, error: authErr } = await supabase.rpc(
        'verify_user_password',
        { entered_password: importPassword }
      );
      if (authErr || !isValidPassword) {
        throw new Error('Authentication failed. Incorrect account password.');
      }

      const summary = await executeValidatedEncryptedImport({
        parsed: importPreview.parsed,
        resolutions: importResolutions,
        actorEmail: user?.email || profile?.email,
        actorId: user?.id,
        onProgress: (percent, label) => setImportProgress({ percent, label }),
      });

      await clearAppCaches();
      await logAudit(
        'DATABASE_ENCRYPTED_IMPORT',
        `SuperAdmin imported encrypted backup (${importFilename}): ${summary.productsInserted} inserted / ${summary.productsOverwritten} overwritten products, ${summary.membersInserted} inserted / ${summary.membersOverwritten} overwritten members.`,
        user?.id
      );

      toast.success(
        `Import complete: ${summary.productsInserted + summary.productsOverwritten} products, ${summary.membersInserted + summary.membersOverwritten} members processed.`
      );
      setIsImportModalOpen(false);
      setImportPreview(null);
      setImportPassword('');
      setImportProgress(null);
      await fetchBackups();
    } catch (err: any) {
      toast.error(err?.message || 'Encrypted backup import failed.');
    } finally {
      setIsImportingData(false);
    }
  };

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
              A cash session is currently open. Saving backups remains available, while restoring snapshots or importing encrypted data requires closing the active cash drawer session first.
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

          <input
            ref={encryptedFileInputRef}
            type="file"
            accept=".wpenc,application/octet-stream"
            onChange={handleEncryptedImportFileChange}
            className="hidden"
          />

          <div className="hidden sm:flex items-center gap-2.5 flex-wrap">
            <button
              type="button"
              onClick={() => {
                setExportPassword('');
                setIsExportModalOpen(true);
              }}
              className="inline-flex items-center justify-center gap-2 px-3.5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-[10px] font-heading tracking-widest uppercase rounded-lg transition-all cursor-pointer shadow-sm"
              title="Export AES-256 encrypted backup data (password required)"
            >
              <Download className="w-3.5 h-3.5" />
              Export Data
            </button>

            <button
              type="button"
              disabled={!!activeSession}
              onClick={() => {
                if (activeSession) {
                  toast.error(
                    'Please close the active cash session before importing data.'
                  );
                  return;
                }
                encryptedFileInputRef.current?.click();
              }}
              title={
                activeSession
                  ? 'Close the active cash session before importing data'
                  : 'Import & validate encrypted backup data (password required)'
              }
              className="inline-flex items-center justify-center gap-2 px-3.5 py-2.5 bg-(--bg-card) hover:bg-(--bg-input) text-(--color-text) border border-(--border-color) text-[10px] font-heading tracking-widest uppercase rounded-lg transition-all cursor-pointer shadow-xs disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <Upload className="w-3.5 h-3.5 text-blue-500" />
              Import Data
            </button>

            <button
              type="button"
              onClick={() => setIsCreateModalOpen(true)}
              title="Save a database backup checkpoint anytime"
              className="inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-emerald-600 text-white hover:bg-emerald-700 text-[10px] font-heading tracking-widest uppercase rounded-lg transition-all cursor-pointer shadow-lg shadow-emerald-600/10"
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
            onRowClick={(b) => handleInspectBackup(b)}
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
                  onClick={() => handleInspectBackup(b)}
                  className="p-4 rounded-2xl border border-(--border-color) bg-(--bg-card) space-y-3 shadow-xs text-left cursor-pointer hover:border-blue-500/40 transition-all"
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
                  <div
                    className="flex items-center justify-between gap-2 pt-2 border-t border-(--border-color)"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <button
                      type="button"
                      onClick={() => handleInspectBackup(b)}
                      className="py-1.5 px-2.5 bg-blue-500/10 hover:bg-blue-600 text-blue-600 dark:text-blue-400 hover:text-white text-[10px] font-heading tracking-wider uppercase rounded-lg transition-all cursor-pointer font-bold border border-blue-500/20 flex items-center justify-center gap-1"
                    >
                      <Eye className="w-3.5 h-3.5" />
                      <span>View</span>
                    </button>

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
                onClick={() => {
                  setExportPassword('');
                  setIsExportModalOpen(true);
                }}
                className="w-9 h-9 rounded-xl bg-blue-600 hover:bg-blue-700 text-white flex items-center justify-center transition-all active:scale-95 cursor-pointer"
                title="Export Encrypted Data"
              >
                <Download className="w-4 h-4" />
              </button>

              <button
                type="button"
                disabled={!!activeSession}
                onClick={() => {
                  if (activeSession) {
                    toast.error(
                      'Close the active cash session before importing data.'
                    );
                    return;
                  }
                  encryptedFileInputRef.current?.click();
                }}
                className="w-9 h-9 rounded-xl bg-(--bg-page) border border-(--border-color) text-blue-600 dark:text-blue-400 flex items-center justify-center transition-all active:scale-95 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                title="Import Encrypted Data"
              >
                <Upload className="w-4 h-4" />
              </button>

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
                onClick={() => setIsCreateModalOpen(true)}
                className="h-9 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white flex items-center justify-center gap-1.5 text-xs font-heading font-black tracking-wider uppercase shadow-md transition-all active:scale-95 cursor-pointer"
              >
                <PlusCircle className="w-4 h-4 shrink-0" />
                <span>SAVE</span>
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

          {/* Included vs Not Included Relevance Summary */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-[11px]">
            <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 space-y-1.5">
              <div className="flex items-center gap-1.5 font-heading font-bold uppercase tracking-wider text-emerald-700 dark:text-emerald-400 text-[10px]">
                <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                <span>Included in Backup</span>
              </div>
              <p className="text-slate-600 dark:text-slate-300 leading-relaxed">
                Sales, Logbook Check-Ins, Member List, Product List &amp; Stock Movements, Subscriptions, Cash Sessions &amp; Movements, Assigned Cards, Staff Profiles, Gym Profile, Revenue Goals, and Rates &amp; Tax Config.
              </p>
            </div>
            <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 space-y-1.5">
              <div className="flex items-center gap-1.5 font-heading font-bold uppercase tracking-wider text-amber-700 dark:text-amber-400 text-[10px]">
                <XCircle className="w-3.5 h-3.5 shrink-0" />
                <span>Not Included</span>
              </div>
              <p className="text-slate-600 dark:text-slate-300 leading-relaxed">
                Auth passwords &amp; OAuth tokens, Storage photos/avatars, Backup history table, and unsynced offline browser items.
              </p>
            </div>
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

      {/* Modal: Export Encrypted Data (Password Re-Auth Required) */}
      <Modal
        isOpen={isExportModalOpen}
        onClose={() => {
          if (!isExportingData) {
            setIsExportModalOpen(false);
            setExportPassword('');
          }
        }}
        title="Export Encrypted Backup Data"
      >
        <form
          onSubmit={handleConfirmEncryptedExport}
          className="space-y-4 font-body text-left"
        >
          <div className="p-3.5 rounded-xl bg-blue-500/10 border border-blue-500/25 flex items-start gap-3 text-xs">
            <FileLock2 className="w-5 h-5 text-blue-600 dark:text-blue-400 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <strong className="font-heading uppercase text-[10px] tracking-wider text-blue-700 dark:text-blue-300 block">
                AES-256-GCM Encrypted Data Export (.wpenc)
              </strong>
              <p className="text-slate-600 dark:text-slate-300 leading-relaxed">
                Exports live Products, Members, Subscriptions, and Cards from
                Supabase in an encrypted package that cannot be read or altered
                even if opened directly in a text editor or Excel.
              </p>
            </div>
          </div>

          {!hasPassword ? (
            <div className="p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/30 text-xs text-rose-600 dark:text-rose-400 font-semibold">
              Password re-authentication is required for exporting data. Please
              create an account password in Personal Account settings first.
            </div>
          ) : (
            <div className="space-y-1.5">
              <label
                htmlFor="exportPasswordInput"
                className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-200 flex items-center gap-1.5"
              >
                <Lock className="w-3.5 h-3.5 text-blue-500" />
                Enter Account Password to Authorize Export
              </label>
              <input
                id="exportPasswordInput"
                type="password"
                autoComplete="off"
                spellCheck={false}
                autoCorrect="off"
                disabled={isExportingData}
                value={exportPassword}
                onChange={(e) => setExportPassword(e.target.value)}
                placeholder="Confirm your SuperAdmin password..."
                className="w-full px-4 py-2.5 border border-(--border-color) rounded-lg text-sm bg-(--bg-page) text-(--color-text) outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all font-medium"
                required
              />
            </div>
          )}

          <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-3 pt-2">
            <Button
              type="button"
              variant="secondary"
              disabled={isExportingData}
              onClick={() => {
                setIsExportModalOpen(false);
                setExportPassword('');
              }}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              loading={isExportingData}
              disabled={!hasPassword || !exportPassword.trim() || isExportingData}
              loadingLabel="ENCRYPTING & EXPORTING..."
              className="bg-blue-600 hover:bg-blue-700 text-white border-blue-600 font-heading text-xs uppercase tracking-wider"
            >
              Verify &amp; Export Encrypted File
            </Button>
          </div>
        </form>
      </Modal>

      {/* Modal: Import Encrypted Data (Validation + Conflict Resolution + Password Re-Auth) */}
      <Modal
        isOpen={isImportModalOpen}
        onClose={() => {
          if (!isImportingData && !isDecodingImport) {
            setIsImportModalOpen(false);
            setImportPreview(null);
            setImportParseError(null);
            setImportPassword('');
            setImportProgress(null);
          }
        }}
        title="Import Encrypted Backup Data"
        className="max-w-2xl w-full p-6 sm:p-8"
      >
        <form
          onSubmit={handleConfirmEncryptedImport}
          className="space-y-4 font-body text-left"
        >
          <div className="p-3 rounded-xl bg-(--bg-page) border border-(--border-color) flex items-center justify-between gap-2 text-xs">
            <div className="flex items-center gap-2 min-w-0">
              <FileLock2 className="w-4 h-4 text-blue-500 shrink-0" />
              <span className="font-mono font-bold truncate">
                {importFilename || 'Encrypted Backup File'}
              </span>
            </div>
            {importPreview && (
              <span className="text-[10px] font-mono text-slate-500 shrink-0">
                SHA-256: {importPreview.fileSha256.slice(0, 10).toUpperCase()}...
              </span>
            )}
          </div>

          {isDecodingImport ? (
            <div className="p-8 text-center space-y-2">
              <Loader2 className="w-6 h-6 animate-spin text-blue-500 mx-auto" />
              <p className="text-xs font-semibold text-slate-500">
                Decrypting payload &amp; running strict schema validation...
              </p>
            </div>
          ) : importParseError ? (
            <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/30 flex items-start gap-3 text-xs text-rose-600 dark:text-rose-400">
              <XCircle className="w-5 h-5 shrink-0 mt-0.5" />
              <div className="space-y-1">
                <strong className="font-heading uppercase text-[10px] tracking-wider block">
                  Decryption / Format Error
                </strong>
                <p>{importParseError}</p>
              </div>
            </div>
          ) : (
            importPreview && (
              <div className="space-y-3">
                {/* Summary KPI Strip */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                  <div className="p-2.5 rounded-xl bg-(--bg-page) border border-(--border-color)">
                    <span className="text-[10px] uppercase font-bold text-slate-400 block">
                      Products
                    </span>
                    <span className="font-mono font-black text-sm">
                      {importPreview.parsed.products.length}
                    </span>
                  </div>
                  <div className="p-2.5 rounded-xl bg-(--bg-page) border border-(--border-color)">
                    <span className="text-[10px] uppercase font-bold text-slate-400 block">
                      Members
                    </span>
                    <span className="font-mono font-black text-sm">
                      {importPreview.parsed.members.length}
                    </span>
                  </div>
                  <div className="p-2.5 rounded-xl bg-(--bg-page) border border-(--border-color)">
                    <span className="text-[10px] uppercase font-bold text-slate-400 block">
                      Duplicates
                    </span>
                    <span className="font-mono font-black text-sm text-amber-500">
                      {importPreview.parsed.conflicts.length}
                    </span>
                  </div>
                  <div className="p-2.5 rounded-xl bg-(--bg-page) border border-(--border-color)">
                    <span className="text-[10px] uppercase font-bold text-slate-400 block">
                      Errors
                    </span>
                    <span
                      className={`font-mono font-black text-sm ${
                        importPreview.parsed.errorCount > 0
                          ? 'text-rose-500'
                          : 'text-emerald-500'
                      }`}
                    >
                      {importPreview.parsed.errorCount}
                    </span>
                  </div>
                </div>

                {/* Validation Result Banner */}
                {importPreview.parsed.errorCount > 0 ? (
                  <div className="p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/30 space-y-2 text-xs">
                    <div className="flex items-center gap-2 font-heading font-bold uppercase text-[10px] text-rose-600 dark:text-rose-400">
                      <XCircle className="w-4 h-4 shrink-0" />
                      <span>
                        Import Blocked — {importPreview.parsed.errorCount}{' '}
                        Validation Error(s)
                      </span>
                    </div>
                    <div className="max-h-36 overflow-y-auto space-y-1 pr-1">
                      {importPreview.parsed.issues
                        .filter((i) => i.severity === 'error')
                        .slice(0, 20)
                        .map((issue, idx) => (
                          <div
                            key={idx}
                            className="text-[11px] font-mono text-rose-700 dark:text-rose-300"
                          >
                            [{issue.group} Line {issue.line}] {issue.message}
                          </div>
                        ))}
                    </div>
                  </div>
                ) : (
                  <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/25 flex items-center gap-2 text-xs text-emerald-700 dark:text-emerald-400 font-semibold">
                    <CheckCircle2 className="w-4 h-4 shrink-0" />
                    <span>
                      Integrity &amp; schema validation passed with zero errors.
                    </span>
                  </div>
                )}

                {/* Duplicate Conflict Actions */}
                {importPreview.parsed.conflicts.length > 0 &&
                  importPreview.parsed.errorCount === 0 && (
                    <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/25 space-y-2 text-xs">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="font-heading font-bold uppercase text-[10px] text-amber-700 dark:text-amber-300">
                          Duplicate Records Detected (
                          {importPreview.parsed.conflicts.length})
                        </span>
                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => {
                              const next: Record<string, DuplicateAction> = {};
                              importPreview.parsed.conflicts.forEach((c) => {
                                next[c.conflictKey] = 'ignore';
                              });
                              setImportResolutions(next);
                            }}
                            className="px-2 py-1 rounded-md border border-(--border-color) bg-(--bg-card) text-[10px] font-bold uppercase cursor-pointer"
                          >
                            Ignore All
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              const next: Record<string, DuplicateAction> = {};
                              importPreview.parsed.conflicts.forEach((c) => {
                                next[c.conflictKey] = 'overwrite';
                              });
                              setImportResolutions(next);
                            }}
                            className="px-2 py-1 rounded-md bg-amber-600 text-white text-[10px] font-bold uppercase cursor-pointer"
                          >
                            Overwrite All
                          </button>
                        </div>
                      </div>

                      <div className="max-h-36 overflow-y-auto space-y-1.5 pr-1">
                        {importPreview.parsed.conflicts.map((c) => {
                          const action =
                            importResolutions[c.conflictKey] ??
                            c.defaultResolution;
                          return (
                            <div
                              key={c.conflictKey}
                              className="p-2 rounded-lg bg-(--bg-card) border border-(--border-color) flex items-center justify-between gap-2 text-[11px]"
                            >
                              <div className="min-w-0 truncate">
                                <span className="font-bold uppercase">
                                  [{c.group}] {c.identifier}
                                </span>
                                <span className="text-slate-400 ml-1.5">
                                  ({c.scope === 'database' ? 'Exists in DB' : `CSV Line ${c.earlierCsvLine}`})
                                </span>
                              </div>
                              <select
                                value={action}
                                onChange={(e) =>
                                  setImportResolutions((prev) => ({
                                    ...prev,
                                    [c.conflictKey]: e.target
                                      .value as DuplicateAction,
                                  }))
                                }
                                className="px-2 py-1 rounded border border-(--border-color) bg-(--bg-page) text-[10px] font-bold uppercase"
                              >
                                <option value="ignore">Ignore</option>
                                <option value="overwrite">Overwrite</option>
                              </select>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                {/* Progress Indicator */}
                {importProgress && (
                  <div className="space-y-1.5 pt-1">
                    <div className="flex justify-between text-[11px] font-mono">
                      <span>{importProgress.label}</span>
                      <span>{importProgress.percent}%</span>
                    </div>
                    <div className="w-full h-2 rounded-full bg-slate-200 dark:bg-zinc-800 overflow-hidden">
                      <div
                        className="h-full bg-blue-600 transition-all"
                        style={{ width: `${importProgress.percent}%` }}
                      />
                    </div>
                  </div>
                )}

                {/* Password Re-Authentication Input */}
                {importPreview.parsed.errorCount === 0 && (
                  !hasPassword ? (
                    <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-xs text-rose-600 dark:text-rose-400 font-semibold">
                      Password re-authentication is required for importing data.
                      Please set an account password in Personal Account first.
                    </div>
                  ) : (
                    <div className="space-y-1.5 pt-1">
                      <label
                        htmlFor="importPasswordInput"
                        className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-200 flex items-center gap-1.5"
                      >
                        <Lock className="w-3.5 h-3.5 text-blue-500" />
                        Enter Account Password to Authorize Import
                      </label>
                      <input
                        id="importPasswordInput"
                        type="password"
                        autoComplete="off"
                        spellCheck={false}
                        autoCorrect="off"
                        disabled={isImportingData}
                        value={importPassword}
                        onChange={(e) => setImportPassword(e.target.value)}
                        placeholder="Confirm your SuperAdmin password..."
                        className="w-full px-4 py-2.5 border border-(--border-color) rounded-lg text-sm bg-(--bg-page) text-(--color-text) outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all font-medium"
                        required
                      />
                    </div>
                  )
                )}
              </div>
            )
          )}

          <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-3 pt-2">
            <Button
              type="button"
              variant="secondary"
              disabled={isImportingData || isDecodingImport}
              onClick={() => {
                setIsImportModalOpen(false);
                setImportPreview(null);
                setImportParseError(null);
                setImportPassword('');
                setImportProgress(null);
              }}
            >
              Cancel
            </Button>
            {importPreview && importPreview.parsed.errorCount === 0 && (
              <Button
                type="submit"
                loading={isImportingData}
                disabled={
                  !hasPassword ||
                  !importPassword.trim() ||
                  isImportingData ||
                  !!activeSession
                }
                loadingLabel="IMPORTING BACKUP..."
                className="bg-blue-600 hover:bg-blue-700 text-white border-blue-600 font-heading text-xs uppercase tracking-wider"
              >
                Verify &amp; Import Backup
              </Button>
            )}
          </div>
        </form>
      </Modal>

      {/* Modal: Backup Overview */}
      <Modal
        isOpen={Boolean(inspectTarget)}
        onClose={() => {
          setInspectTarget(null);
          setInspectPayload(null);
          setInspectError(null);
        }}
        title="Backup Overview"
        className="max-w-4xl w-full text-left p-6 sm:p-8"
      >
        {inspectTarget && (() => {
          const isUuidValue = (val: unknown): boolean => {
            if (typeof val !== 'string') return false;
            return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
              val.trim()
            );
          };

          const formatPhtDateOnly = (raw?: string | null): string => {
            if (!raw) return '—';
            const d = new Date(raw);
            if (isNaN(d.getTime())) return String(raw).slice(0, 10);
            return d.toLocaleDateString('en-US', {
              timeZone: 'Asia/Manila',
              month: 'short',
              day: 'numeric',
              year: 'numeric',
            });
          };

          const formatPhtDateTime = (raw?: string | null): string => {
            if (!raw) return '—';
            const d = new Date(raw);
            if (isNaN(d.getTime())) return String(raw).slice(0, 16);
            return d.toLocaleString('en-US', {
              timeZone: 'Asia/Manila',
              month: 'short',
              day: 'numeric',
              year: 'numeric',
              hour: 'numeric',
              minute: '2-digit',
            });
          };

          const formatDenominationsSummary = (row: any): string => {
            const rawDenom =
              row?.closing_denominations ??
              row?.closing_breakdown ??
              row?.denominations ??
              row?.cash_breakdown ??
              row?.opening_denominations;
            if (!rawDenom) return '';
            let obj: any = rawDenom;
            if (typeof rawDenom === 'string') {
              try {
                obj = JSON.parse(rawDenom);
              } catch {
                return '';
              }
            }
            if (!obj || typeof obj !== 'object') return '';

            const labelMap: Record<string, { label: string; value: number }> = {
              bill_1000: { label: '₱1,000', value: 1000 },
              bill_500: { label: '₱500', value: 500 },
              bill_200: { label: '₱200', value: 200 },
              bill_100: { label: '₱100', value: 100 },
              bill_50: { label: '₱50', value: 50 },
              bill_20: { label: '₱20', value: 20 },
              coin_20: { label: '₱20c', value: 20 },
              coin_10: { label: '₱10', value: 10 },
              coin_5: { label: '₱5', value: 5 },
              coin_1: { label: '₱1', value: 1 },
              coin_025: { label: '25¢', value: 0.25 },
              '1000': { label: '₱1,000', value: 1000 },
              '500': { label: '₱500', value: 500 },
              '200': { label: '₱200', value: 200 },
              '100': { label: '₱100', value: 100 },
              '50': { label: '₱50', value: 50 },
              '20': { label: '₱20', value: 20 },
              '10': { label: '₱10', value: 10 },
              '5': { label: '₱5', value: 5 },
              '1': { label: '₱1', value: 1 },
              '0.25': { label: '25¢', value: 0.25 },
            };

            const parts: string[] = [];
            let totalCounted = 0;
            Object.entries(obj).forEach(([k, v]) => {
              const count = Number(v || 0);
              if (count > 0) {
                const meta = labelMap[k];
                if (meta) {
                  parts.push(`${meta.label}×${count}`);
                  totalCounted += meta.value * count;
                } else if (!isNaN(Number(k))) {
                  parts.push(`₱${k}×${count}`);
                  totalCounted += Number(k) * count;
                }
              }
            });

            if (parts.length === 0) return '';
            return `Denoms: ${parts.join(', ')} (₱${totalCounted.toLocaleString('en-PH', {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            })})`;
          };

          // Build relationship lookup maps from snapshot rows to replace every UUID with real names
          const memberMap = new Map<string, any>();
          (inspectPayload?.members || []).forEach((m: any) => {
            if (m?.member_id) memberMap.set(String(m.member_id), m);
            if (m?.id) memberMap.set(String(m.id), m);
          });

          const productMap = new Map<string, any>();
          (inspectPayload?.products || []).forEach((p: any) => {
            if (p?.id) productMap.set(String(p.id), p);
            if (p?.barcode_id) productMap.set(String(p.barcode_id), p);
          });

          const profileMap = new Map<string, any>();
          (inspectPayload?.profiles || []).forEach((p: any) => {
            if (p?.id) profileMap.set(String(p.id), p);
          });

          const sessionMap = new Map<string, any>();
          (inspectPayload?.cash_sessions || []).forEach((s: any) => {
            if (s?.id) sessionMap.set(String(s.id), s);
          });

          const tableEntries = inspectPayload
            ? Object.entries(inspectPayload)
                .filter(([tableName]) => !HIDDEN_BACKUP_OVERVIEW_TABLES.has(tableName))
                .sort(([a], [b]) => {
                  const idxA = PRIORITY_INSPECT_TABLES.indexOf(a);
                  const idxB = PRIORITY_INSPECT_TABLES.indexOf(b);
                  if (idxA !== -1 && idxB !== -1) return idxA - idxB;
                  if (idxA !== -1) return -1;
                  if (idxB !== -1) return 1;
                  return a.localeCompare(b);
                })
            : [];

          const totalIncludedRecords = tableEntries.reduce(
            (sum, [, rows]) => sum + rows.length,
            0
          );

          const formatCellPreview = (row: any) => {
            if (!row || typeof row !== 'object') {
              return { title: String(row), subtitle: '', right: '' };
            }

            if (selectedInspectTable === 'sales') {
              const prod = productMap.get(String(row.product_id || ''));
              const prodName =
                (!isUuidValue(row.product_name) && row.product_name) ||
                prod?.product_name ||
                'POS Sale';
              const actorName =
                (!isUuidValue(row.processed_by_name) && row.processed_by_name) ||
                profileMap.get(String(row.processed_by || ''))?.username ||
                '';
              const qtyLabel = row.quantity ? `${row.quantity}× ` : '';
              return {
                title: `${qtyLabel}${prodName}`,
                subtitle: `${row.receipt_no || 'No Receipt'} • ${row.payment_method || 'Cash'}${actorName ? ` • By ${actorName}` : ''}${row.created_at ? ` • ${formatPhtDateTime(row.created_at)}` : ''}${row.deleted_at ? ' • [In Recycle Bin]' : ''}`,
                right: `₱${Number(row.total_amount || 0).toFixed(2)}`,
              };
            }

            if (selectedInspectTable === 'attendance') {
              const member = memberMap.get(String(row.member_id || ''));
              const customerName =
                (!isUuidValue(row.customer_name) && row.customer_name) ||
                member?.full_name ||
                'Walk-In Guest';
              return {
                title: customerName,
                subtitle: `${row.customer_type || 'Entry'} • ${row.payment_method || 'Cash'}${row.created_at ? ` • ${formatPhtDateTime(row.created_at)}` : ''}${row.deleted_at ? ' • [In Recycle Bin]' : ''}`,
                right: `₱${Number(row.entry_fee || 0).toFixed(2)}`,
              };
            }

            if (selectedInspectTable === 'members') {
              return {
                title: row.full_name || 'Member',
                subtitle: `${row.member_id || 'No Member ID'} • ${row.phone || 'No phone'} • ${row.status || 'Active'}`,
                right: row.membership_plan || row.customer_type || '',
              };
            }

            if (selectedInspectTable === 'products') {
              return {
                title: row.product_name || 'Product',
                subtitle: `Barcode: ${row.barcode_id || 'N/A'} • Stock: ${row.stock_quantity ?? row.stock ?? 0}${row.category ? ` • ${row.category}` : ''}`,
                right: `₱${Number(row.selling_price || 0).toFixed(2)}`,
              };
            }

            if (selectedInspectTable === 'stock_movements') {
              const prod = productMap.get(String(row.product_id || ''));
              const prodName =
                (!isUuidValue(row.product_name) && row.product_name) ||
                prod?.product_name ||
                'Product Stock Adjustment';
              const actorName =
                (!isUuidValue(row.created_by_name) && row.created_by_name) ||
                profileMap.get(String(row.created_by || ''))?.username ||
                'Staff';
              const qtyDelta = Number(row.quantity_added ?? 0);
              const signedQty = `${qtyDelta >= 0 ? '+' : ''}${qtyDelta}`;
              const moveLabel = String(row.movement_type || 'RESTOCK').toUpperCase();
              const noteText =
                row.note && !isUuidValue(row.note) ? ` • "${row.note}"` : '';
              return {
                title: `${prodName} (${moveLabel})`,
                subtitle: `Stock: ${row.previous_stock ?? 0} → ${row.new_stock ?? 0} • By ${actorName}${noteText}${row.created_at ? ` • ${formatPhtDateTime(row.created_at)}` : ''}`,
                right: `${signedQty} units`,
              };
            }

            if (selectedInspectTable === 'subscriptions') {
              const member = memberMap.get(String(row.member_id || ''));
              const memberName =
                (!isUuidValue(row.member_name) && row.member_name) ||
                (!isUuidValue(row.customer_name) && row.customer_name) ||
                member?.full_name ||
                '';
              const planLabel = String(row.plan_type || 'Subscription').toUpperCase();
              return {
                title: memberName
                  ? `${memberName} — ${planLabel} Plan`
                  : `${planLabel} Plan (${row.member_id || 'Member'})`,
                subtitle: `${row.member_id || ''}${row.receipt_number ? ` • ${row.receipt_number}` : ''} • ${row.status || 'Active'} • ${formatPhtDateOnly(row.start_date)} → ${formatPhtDateOnly(row.end_date)} • ${row.payment_method || 'Cash'}`,
                right: `₱${Number(row.price || 0).toFixed(2)}`,
              };
            }

            if (selectedInspectTable === 'cash_sessions') {
              const openedDate = formatPhtDateTime(row.opened_at || row.created_at);
              const closedLabel = row.closed_at
                ? `Closed ${formatPhtDateTime(row.closed_at)}`
                : 'Open Session';
              const denomSummary = formatDenominationsSummary(row);
              const titleLabel = row.session_number
                ? `Session #${row.session_number} • ${formatPhtDateOnly(row.opened_at || row.created_at)}`
                : `Cash Session • ${formatPhtDateOnly(row.opened_at || row.created_at)}`;
              return {
                title: titleLabel,
                subtitle: `Opened: ${openedDate} • ${closedLabel} • By ${row.opened_by_name || 'Staff'}${denomSummary ? ` • ${denomSummary}` : ' • No denomination count'}`,
                right:
                  row.closing_actual_cash !== null &&
                  row.closing_actual_cash !== undefined
                    ? `Float ₱${Number(row.opening_float || 0).toFixed(2)} → ₱${Number(row.closing_actual_cash).toFixed(2)}`
                    : `Float ₱${Number(row.opening_float || 0).toFixed(2)}`,
              };
            }

            if (selectedInspectTable === 'cash_transactions') {
              const typeMap: Record<string, string> = {
                cash_in: 'Cash In',
                cash_out: 'Cash Out',
                digital_in: 'Digital In',
              };
              const typeLabel = typeMap[row.type] || String(row.type || 'Movement').toUpperCase();
              const rawReason =
                (!isUuidValue(row.reason) && row.reason) ||
                (!isUuidValue(row.description) && row.description) ||
                (!isUuidValue(row.notes) && row.notes) ||
                (!isUuidValue(row.category) && row.category) ||
                '';
              const linkedSession = sessionMap.get(String(row.session_id || ''));
              const actorName =
                (!isUuidValue(row.performed_by_name) && row.performed_by_name) ||
                profileMap.get(String(row.performed_by || ''))?.username ||
                'Staff';
              const sessionTag = linkedSession?.session_number
                ? ` • Session #${linkedSession.session_number}`
                : '';
              const refTag =
                row.reference_number && !isUuidValue(row.reference_number)
                  ? ` • Ref: ${row.reference_number}`
                  : '';
              return {
                title: rawReason ? `${typeLabel}: ${rawReason}` : typeLabel,
                subtitle: `${String(row.status || 'completed').toUpperCase()} • By ${actorName}${sessionTag}${refTag}${row.created_at ? ` • ${formatPhtDateTime(row.created_at)}` : ''}`,
                right: `${row.type === 'cash_out' ? '-' : '+'}₱${Number(row.amount || 0).toFixed(2)}`,
              };
            }

            if (selectedInspectTable === 'member_cards') {
              const member = memberMap.get(String(row.member_id || ''));
              const memberName =
                (!isUuidValue(row.member_name) && row.member_name) ||
                (!isUuidValue(row.full_name) && row.full_name) ||
                member?.full_name ||
                '';
              return {
                title: memberName
                  ? `${memberName} (${row.member_id || ''})`
                  : `Member ${row.member_id || 'Card'}`,
                subtitle: `${row.card_type || 'QR'} Card v${row.version ?? 1} • ${row.status || 'Active'} • Payment: ${row.payment_status || 'PAID'} • Claim: ${row.claim_status || 'UNCLAIMED'}${row.issued_at ? ` • Issued ${formatPhtDateOnly(row.issued_at)}` : ''}`,
                right:
                  row.card_fee_paid !== null && row.card_fee_paid !== undefined
                    ? `₱${Number(row.card_fee_paid).toFixed(2)}`
                    : row.status || '',
              };
            }

            if (selectedInspectTable === 'cards') {
              const member = memberMap.get(String(row.member_id || ''));
              const holderName =
                (!isUuidValue(row.holder_name) && row.holder_name) ||
                (!isUuidValue(row.member_name) && row.member_name) ||
                member?.full_name ||
                '';
              const cardCode =
                (!isUuidValue(row.card_code) && row.card_code) ||
                (!isUuidValue(row.card_number) && row.card_number) ||
                'Physical Card';
              return {
                title: holderName ? `${holderName} — ${cardCode}` : cardCode,
                subtitle: `${row.card_type || 'QR/NFC'} • ${row.status || 'Available'}${row.issued_at ? ` • ${formatPhtDateOnly(row.issued_at)}` : ''}`,
                right: row.status || '',
              };
            }

            if (selectedInspectTable === 'profiles') {
              return {
                title: row.username || row.email || 'Staff Account',
                subtitle: `${row.email || 'No email'} • Role: ${String(row.role || 'staff').toUpperCase()} • Status: ${String(row.status || 'active').toUpperCase()}`,
                right: row.created_at ? formatPhtDateOnly(row.created_at) : '',
              };
            }

            if (selectedInspectTable === 'incident_reports') {
              const actorName =
                (!isUuidValue(row.reported_by_name) && row.reported_by_name) ||
                profileMap.get(String(row.reported_by || ''))?.username ||
                '';
              return {
                title: row.title || row.subject || row.category || 'Incident Report',
                subtitle: `Status: ${row.status || 'Unread'}${actorName ? ` • By ${actorName}` : ''}${row.created_at ? ` • ${formatPhtDateTime(row.created_at)}` : ''}`,
                right: row.severity || row.status || '',
              };
            }

            // Generic non-UUID fallback for any remaining table
            const readableEntries = Object.entries(row).filter(
              ([k, v]) =>
                k !== 'id' &&
                !k.endsWith('_id') &&
                v !== null &&
                v !== undefined &&
                v !== '' &&
                !isUuidValue(v)
            );
            const fallbackTitleCandidate =
              (!isUuidValue(row.name) && row.name) ||
              (!isUuidValue(row.username) && row.username) ||
              (!isUuidValue(row.title) && row.title) ||
              (!isUuidValue(row.reason) && row.reason) ||
              (!isUuidValue(row.description) && row.description) ||
              (readableEntries[0] ? String(readableEntries[0][1]) : 'Record');

            return {
              title: String(fallbackTitleCandidate),
              subtitle: readableEntries
                .slice(0, 3)
                .map(([k, v]) => `${k}: ${String(v).slice(0, 32)}`)
                .join(' • '),
              right: row.created_at ? formatPhtDateOnly(row.created_at) : '',
            };
          };

          const activeRows = HIDDEN_BACKUP_OVERVIEW_TABLES.has(selectedInspectTable)
            ? []
            : inspectPayload?.[selectedInspectTable] || [];

          const filteredRows = activeRows.filter((row) => {
            if (!inspectSearch.trim()) return true;
            const q = inspectSearch.trim().toLowerCase();
            const preview = formatCellPreview(row);
            if (
              preview.title.toLowerCase().includes(q) ||
              preview.subtitle.toLowerCase().includes(q) ||
              preview.right.toLowerCase().includes(q)
            ) {
              return true;
            }
            try {
              return JSON.stringify(row).toLowerCase().includes(q);
            } catch {
              return false;
            }
          });

          // Extract 1-row configuration objects for formal layout display
          const gymProfileRow =
            inspectPayload?.gym_profile?.[0] ||
            inspectPayload?.gym_profile_settings?.[0] ||
            null;
          const revenueGoalsRow = inspectPayload?.revenue_goals?.[0] || null;
          const ratesConfigRow =
            inspectPayload?.rates_config?.[0] ||
            inspectPayload?.rates_payments_config?.[0] ||
            null;

          return (
            <div className="space-y-5 font-body text-left">
              {/* Header Info Strip */}
              <div className="p-3.5 rounded-2xl bg-(--bg-page) border border-(--border-color) flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
                <div className="min-w-0">
                  <div className="font-heading font-bold text-sm text-(--color-text) truncate">
                    {inspectTarget.notes || inspectTarget.filename}
                  </div>
                  <div className="text-[11px] text-slate-500 dark:text-slate-400 font-mono">
                    {new Date(inspectTarget.created_at).toLocaleString('en-US', {
                      timeZone: 'Asia/Manila',
                      month: 'short',
                      day: 'numeric',
                      year: 'numeric',
                      hour: 'numeric',
                      minute: '2-digit',
                    })}{' '}
                    (PHT) • {formatSize(inspectTarget.size_bytes)}
                  </div>
                </div>
                {inspectPayload && (
                  <span className="px-2.5 py-1 rounded-lg bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20 font-mono font-bold text-[10px] shrink-0">
                    {tableEntries.length} Datasets • {totalIncludedRecords} Records
                  </span>
                )}
              </div>

              {isInspectLoading ? (
                <div className="p-10 flex flex-col items-center justify-center gap-2 text-xs text-slate-400 font-mono">
                  <Loader2 className="w-6 h-6 animate-spin text-blue-500" />
                  <span>Reading backup snapshot payload...</span>
                </div>
              ) : inspectError ? (
                <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/30 text-xs text-rose-500 font-semibold">
                  {inspectError}
                </div>
              ) : inspectPayload ? (
                <>
                  {/* Included vs Not Included Comparison */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                    {/* Included */}
                    <div className="p-3.5 rounded-2xl bg-emerald-500/5 border border-emerald-500/25 space-y-2.5">
                      <div className="flex items-center justify-between">
                        <span className="flex items-center gap-1.5 font-heading font-black uppercase tracking-wider text-emerald-700 dark:text-emerald-400 text-[10px]">
                          <CheckCircle2 className="w-4 h-4 shrink-0" />
                          <span>Included Datasets ({tableEntries.length})</span>
                        </span>
                      </div>
                      <div className="max-h-44 overflow-y-auto space-y-1.5 pr-1">
                        {tableEntries.map(([tableName, rows]) => {
                          const meta = BACKUP_TABLE_LABELS[tableName];
                          const isSelected = selectedInspectTable === tableName;
                          return (
                            <button
                              key={tableName}
                              type="button"
                              onClick={() => {
                                setSelectedInspectTable(tableName);
                                setInspectSearch('');
                              }}
                              className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-[11px] transition-all cursor-pointer border ${
                                isSelected
                                  ? 'bg-emerald-600 text-white border-emerald-600 font-bold shadow-xs'
                                  : 'bg-white/70 dark:bg-white/5 border-(--border-color) text-(--color-text) hover:border-emerald-500/40'
                              }`}
                            >
                              <span className="truncate">
                                {meta?.label || tableName.replace(/_/g, ' ')}
                              </span>
                              <span
                                className={`font-mono text-[10px] px-1.5 py-0.2 rounded ${
                                  isSelected
                                    ? 'bg-white/20 text-white'
                                    : rows.length > 0
                                      ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 font-bold'
                                      : 'bg-slate-200 dark:bg-white/10 text-slate-500'
                                }`}
                              >
                                {rows.length}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {/* Not Included */}
                    <div className="p-3.5 rounded-2xl bg-amber-500/5 border border-amber-500/25 space-y-2.5">
                      <div className="flex items-center gap-1.5 font-heading font-black uppercase tracking-wider text-amber-700 dark:text-amber-400 text-[10px]">
                        <XCircle className="w-4 h-4 shrink-0" />
                        <span>Not Included (Important Exclusions)</span>
                      </div>
                      <div className="space-y-2">
                        {EXCLUDED_IMPORTANT_ITEMS.map((item) => (
                          <div
                            key={item.title}
                            className="p-2 rounded-lg bg-white/70 dark:bg-white/5 border border-(--border-color) space-y-0.5"
                          >
                            <div className="text-[11px] font-bold text-slate-800 dark:text-slate-200">
                              {item.title}
                            </div>
                            <div className="text-[10px] text-slate-500 dark:text-slate-400 leading-snug">
                              {item.reason}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Inside Snapshot Preview Explorer */}
                  <div className="space-y-2.5 pt-1">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                      <div>
                        <h5 className="text-xs font-heading font-black uppercase tracking-wider text-(--color-text)">
                          Inside:{' '}
                          {BACKUP_TABLE_LABELS[selectedInspectTable]?.label ||
                            selectedInspectTable.replace(/_/g, ' ')}{' '}
                          ({filteredRows.length})
                        </h5>
                        <p className="text-[10px] text-slate-500 dark:text-slate-400">
                          Click any included dataset above to inspect stored records.
                        </p>
                      </div>
                      <div className="relative w-full sm:w-56">
                        <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                        <input
                          type="text"
                          value={inspectSearch}
                          onChange={(e) => setInspectSearch(e.target.value)}
                          placeholder="Search inside table..."
                          className="w-full pl-8 pr-3 py-1.5 rounded-lg border border-(--border-color) bg-(--bg-page) text-[11px] text-(--color-text) outline-none focus:border-blue-500"
                        />
                      </div>
                    </div>

                    <div className="max-h-60 overflow-y-auto rounded-xl border border-(--border-color) bg-(--bg-page) divide-y divide-(--border-color)">
                      {filteredRows.length === 0 ? (
                        <div className="p-6 text-center text-xs text-slate-400 font-mono">
                          No records stored in "{BACKUP_TABLE_LABELS[selectedInspectTable]?.label || selectedInspectTable}" for this snapshot.
                        </div>
                      ) : (
                        filteredRows.slice(0, 50).map((row, idx) => {
                          const preview = formatCellPreview(row);
                          return (
                            <div
                              key={row.id || idx}
                              className="p-2.5 px-3 flex items-center justify-between gap-3 text-xs hover:bg-slate-100/50 dark:hover:bg-white/[0.02]"
                            >
                              <div className="min-w-0">
                                <div className="font-semibold text-(--color-text) truncate">
                                  {preview.title}
                                </div>
                                <div className="text-[10px] font-mono text-slate-500 dark:text-slate-400 truncate">
                                  {preview.subtitle}
                                </div>
                              </div>
                              {preview.right && (
                                <span className="font-mono font-bold text-xs text-emerald-600 dark:text-emerald-400 shrink-0 text-right">
                                  {preview.right}
                                </span>
                              )}
                            </div>
                          );
                        })
                      )}
                    </div>
                  </div>

                  {/* Formal Configuration & Goals Layouts (Single-Row Snapshots) */}
                  {(gymProfileRow || revenueGoalsRow || ratesConfigRow) && (
                    <div className="space-y-4 pt-2 border-t border-(--border-color)">
                      <div className="flex items-center justify-between">
                        <h5 className="text-xs font-heading font-black uppercase tracking-wider text-(--color-text)">
                          Formal System &amp; Rate Configuration Snapshot
                        </h5>
                        <span className="text-[10px] font-mono text-slate-500 dark:text-slate-400">
                          Restored automatically with snapshot
                        </span>
                      </div>

                      {/* 1. Formal Gym Profile Settings */}
                      {gymProfileRow && (
                        <div className="p-4 sm:p-5 bg-slate-50/50 dark:bg-neutral-900/20 border border-slate-200 dark:border-white/10 rounded-2xl space-y-4">
                          <div className="flex items-center justify-between gap-3">
                            <h6 className="text-xs font-heading tracking-wider uppercase text-slate-900 dark:text-slate-100 flex items-center gap-2">
                              <Building className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                              <span>Gym Profile Settings</span>
                            </h6>
                            <div className="w-10 h-10 rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#13161a] flex items-center justify-center overflow-hidden shrink-0">
                              <img
                                src={gymProfileRow.gym_logo || defaultLogo}
                                alt="Snapshot Gym Logo"
                                className="w-full h-full object-contain p-1"
                              />
                            </div>
                          </div>

                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                            <div className="p-2.5 rounded-xl bg-white dark:bg-[#13161a] border border-slate-200/80 dark:border-white/10 space-y-0.5">
                              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
                                Gym Name
                              </span>
                              <span className="font-bold text-slate-900 dark:text-slate-100 block truncate">
                                {gymProfileRow.gym_name || 'WOLF PALOMAR GYM'}
                              </span>
                            </div>
                            <div className="p-2.5 rounded-xl bg-white dark:bg-[#13161a] border border-slate-200/80 dark:border-white/10 space-y-0.5">
                              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
                                Business Email
                              </span>
                              <span className="font-mono text-slate-900 dark:text-slate-100 block truncate">
                                {gymProfileRow.email_address || '—'}
                              </span>
                            </div>
                            <div className="sm:col-span-2 p-2.5 rounded-xl bg-white dark:bg-[#13161a] border border-slate-200/80 dark:border-white/10 space-y-0.5">
                              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
                                Physical Address
                              </span>
                              <span className="text-slate-800 dark:text-slate-200 block">
                                {gymProfileRow.gym_address || '—'}
                              </span>
                            </div>
                            <div className="sm:col-span-2 p-2.5 rounded-xl bg-white dark:bg-[#13161a] border border-slate-200/80 dark:border-white/10 space-y-0.5">
                              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
                                Gym Description
                              </span>
                              <p className="text-[11px] text-slate-600 dark:text-slate-300 leading-relaxed">
                                {gymProfileRow.gym_description || '—'}
                              </p>
                            </div>
                            <div className="p-2.5 rounded-xl bg-white dark:bg-[#13161a] border border-slate-200/80 dark:border-white/10 space-y-0.5">
                              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
                                Primary Contact (1)
                              </span>
                              <span className="font-semibold text-slate-900 dark:text-slate-100 block">
                                {gymProfileRow.contact_name_1 || 'Contact 1'}
                              </span>
                              <span className="font-mono text-[11px] text-slate-500 dark:text-slate-400 block">
                                {gymProfileRow.contact_number_1 || '—'}
                              </span>
                            </div>
                            <div className="p-2.5 rounded-xl bg-white dark:bg-[#13161a] border border-slate-200/80 dark:border-white/10 space-y-0.5">
                              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
                                Secondary Contact (2)
                              </span>
                              <span className="font-semibold text-slate-900 dark:text-slate-100 block">
                                {gymProfileRow.contact_name_2 || 'Contact 2'}
                              </span>
                              <span className="font-mono text-[11px] text-slate-500 dark:text-slate-400 block">
                                {gymProfileRow.contact_number_2 || '—'}
                              </span>
                            </div>
                          </div>
                        </div>
                      )}

                      {/* 2. Formal Revenue Goals (4-Card Themed Grid matching RevenueGoalsPage) */}
                      {revenueGoalsRow && (
                        <div className="p-4 sm:p-5 bg-white dark:bg-[#161920] border border-slate-200/80 dark:border-slate-800 rounded-2xl space-y-3.5">
                          <h6 className="text-xs font-heading tracking-wider uppercase text-slate-900 dark:text-white flex items-center gap-2">
                            <Target className="w-4 h-4 text-[#123c73] dark:text-blue-400" />
                            <span>Revenue Goals</span>
                          </h6>

                          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                            <div className="p-3.5 rounded-2xl bg-emerald-50/60 dark:bg-emerald-950/20 border border-emerald-200/80 dark:border-emerald-800/50 space-y-1.5">
                              <div className="flex items-center justify-between text-emerald-700 dark:text-emerald-400">
                                <span className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider">
                                  <Clock className="w-3.5 h-3.5" />
                                  Daily Target
                                </span>
                              </div>
                              <div className="text-base font-black font-mono text-slate-900 dark:text-white">
                                ₱{Number(revenueGoalsRow.daily || 0).toLocaleString('en-PH')}
                              </div>
                            </div>

                            <div className="p-3.5 rounded-2xl bg-sky-50/60 dark:bg-sky-950/20 border border-sky-200/80 dark:border-sky-800/50 space-y-1.5">
                              <div className="flex items-center justify-between text-sky-700 dark:text-sky-400">
                                <span className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider">
                                  <CalendarDays className="w-3.5 h-3.5" />
                                  Weekly Target
                                </span>
                              </div>
                              <div className="text-base font-black font-mono text-slate-900 dark:text-white">
                                ₱{Number(revenueGoalsRow.weekly || 0).toLocaleString('en-PH')}
                              </div>
                            </div>

                            <div className="p-3.5 rounded-2xl bg-blue-50/60 dark:bg-blue-950/20 border border-blue-200/80 dark:border-blue-800/50 space-y-1.5">
                              <div className="flex items-center justify-between text-blue-700 dark:text-blue-400">
                                <span className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider">
                                  <Calendar className="w-3.5 h-3.5" />
                                  Monthly Target
                                </span>
                              </div>
                              <div className="text-base font-black font-mono text-slate-900 dark:text-white">
                                ₱{Number(revenueGoalsRow.monthly || 0).toLocaleString('en-PH')}
                              </div>
                            </div>

                            <div className="p-3.5 rounded-2xl bg-amber-50/60 dark:bg-amber-950/20 border border-amber-200/80 dark:border-amber-800/50 space-y-1.5">
                              <div className="flex items-center justify-between text-amber-700 dark:text-amber-400">
                                <span className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider">
                                  <Trophy className="w-3.5 h-3.5" />
                                  Yearly Target
                                </span>
                              </div>
                              <div className="text-base font-black font-mono text-slate-900 dark:text-white">
                                ₱{Number(revenueGoalsRow.yearly || 0).toLocaleString('en-PH')}
                              </div>
                            </div>
                          </div>
                        </div>
                      )}

                      {/* 3. Formal Rates & Payments Config (matching RatesPayments.tsx) */}
                      {ratesConfigRow && (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                          <div className="p-4 bg-(--bg-page) border border-(--border-color) rounded-2xl space-y-3">
                            <h6 className="text-xs font-heading tracking-wider uppercase text-(--color-text) flex items-center gap-2">
                              <CreditCard className="w-4 h-4 text-(--color-primary-light)" />
                              <span>Membership Plan Rates</span>
                            </h6>
                            <div className="grid grid-cols-2 gap-2.5">
                              <div className="p-2.5 rounded-xl bg-(--bg-card) border border-(--border-color)">
                                <span className="text-[10px] font-bold uppercase text-slate-400 block">
                                  Monthly Plan Rate
                                </span>
                                <span className="font-mono font-bold text-sm text-(--color-text)">
                                  ₱{Number(ratesConfigRow.monthly_rate ?? 0).toLocaleString('en-PH')}
                                </span>
                              </div>
                              <div className="p-2.5 rounded-xl bg-(--bg-card) border border-(--border-color)">
                                <span className="text-[10px] font-bold uppercase text-slate-400 block">
                                  Yearly Registration
                                </span>
                                <span className="font-mono font-bold text-sm text-(--color-text)">
                                  ₱{Number(ratesConfigRow.yearly_rate ?? 0).toLocaleString('en-PH')}
                                </span>
                              </div>
                            </div>
                          </div>

                          <div className="p-4 bg-(--bg-page) border border-(--border-color) rounded-2xl space-y-3">
                            <h6 className="text-xs font-heading tracking-wider uppercase text-(--color-text) flex items-center gap-2">
                              <User className="w-4 h-4 text-(--color-primary-light)" />
                              <span>Walk-In Daily Fees</span>
                            </h6>
                            <div className="grid grid-cols-3 gap-2">
                              <div className="p-2.5 rounded-xl bg-(--bg-card) border border-(--border-color)">
                                <span className="text-[9px] font-bold uppercase text-slate-400 block truncate">
                                  Regular
                                </span>
                                <span className="font-mono font-bold text-sm text-(--color-text)">
                                  ₱{Number(ratesConfigRow.regular_walk_in ?? 0).toLocaleString('en-PH')}
                                </span>
                              </div>
                              <div className="p-2.5 rounded-xl bg-(--bg-card) border border-(--border-color)">
                                <span className="text-[9px] font-bold uppercase text-slate-400 block truncate">
                                  Student
                                </span>
                                <span className="font-mono font-bold text-sm text-(--color-text)">
                                  ₱{Number(ratesConfigRow.student_walk_in ?? 0).toLocaleString('en-PH')}
                                </span>
                              </div>
                              <div className="p-2.5 rounded-xl bg-(--bg-card) border border-(--border-color)">
                                <span className="text-[9px] font-bold uppercase text-slate-400 block truncate">
                                  Yearly Daily
                                </span>
                                <span className="font-mono font-bold text-sm text-(--color-text)">
                                  ₱{Number(ratesConfigRow.yearly_walk_in ?? 0).toLocaleString('en-PH')}
                                </span>
                              </div>
                            </div>
                          </div>

                          <div className="p-4 bg-(--bg-page) border border-(--border-color) rounded-2xl space-y-3">
                            <h6 className="text-xs font-heading tracking-wider uppercase text-(--color-text) flex items-center gap-2">
                              <Smartphone className="w-4 h-4 text-(--color-primary-light)" />
                              <span>Additional Charges</span>
                            </h6>
                            <div className="grid grid-cols-2 gap-2.5">
                              <div className="p-2.5 rounded-xl bg-(--bg-card) border border-(--border-color)">
                                <span className="text-[10px] font-bold uppercase text-slate-400 block">
                                  GCash Surcharge
                                </span>
                                <span className="font-mono font-bold text-sm text-(--color-text)">
                                  ₱{Number(ratesConfigRow.gcash_fee ?? 0).toLocaleString('en-PH')}
                                </span>
                              </div>
                              <div className="p-2.5 rounded-xl bg-(--bg-card) border border-(--border-color)">
                                <span className="text-[10px] font-bold uppercase text-slate-400 block">
                                  New Card Fee
                                </span>
                                <span className="font-mono font-bold text-sm text-(--color-text)">
                                  ₱{Number(ratesConfigRow.new_card_fee ?? 0).toLocaleString('en-PH')}
                                </span>
                              </div>
                            </div>
                          </div>

                          <div className="p-4 bg-(--bg-page) border border-(--border-color) rounded-2xl space-y-3">
                            <div className="flex items-center justify-between">
                              <h6 className="text-xs font-heading tracking-wider uppercase text-(--color-text) flex items-center gap-2">
                                <Percent className="w-4 h-4 text-(--color-primary-light)" />
                                <span>VAT Settings</span>
                              </h6>
                              <span
                                className={`px-2 py-0.5 rounded-full text-[10px] font-heading font-bold uppercase ${
                                  ratesConfigRow.vat_enabled
                                    ? 'bg-emerald-500/10 text-emerald-500 border border-emerald-500/20'
                                    : 'bg-slate-200 dark:bg-white/10 text-slate-500'
                                }`}
                              >
                                {ratesConfigRow.vat_enabled ? 'Enabled' : 'Disabled'}
                              </span>
                            </div>
                            <div className="p-2.5 rounded-xl bg-(--bg-card) border border-(--border-color)">
                              <span className="text-[10px] font-bold uppercase text-slate-400 block">
                                VAT Percentage (%)
                              </span>
                              <span className="font-mono font-bold text-sm text-(--color-text)">
                                {Number(ratesConfigRow.vat_percentage ?? 0)}%
                              </span>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </>
              ) : null}

              <div className="flex flex-col-reverse sm:flex-row sm:justify-between items-stretch sm:items-center gap-2 pt-1">
                <span className="text-[10px] text-slate-500 font-mono">
                  Read-only snapshot inspection (live database unchanged)
                </span>
                <div className="flex items-center justify-end gap-2">
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => {
                      setInspectTarget(null);
                      setInspectPayload(null);
                    }}
                  >
                    Close
                  </Button>
                </div>
              </div>
            </div>
          );
        })()}
      </Modal>
    </div>
  );
};

export default DatabaseBackup;
