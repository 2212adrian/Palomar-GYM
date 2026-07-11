//src/pages/system/DatabaseBackup.tsx
import React, { useState, useRef, useEffect } from 'react';
import { supabase } from '../../lib/supabase/client';
import { logAudit } from '../../lib/supabase/audit';
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
  ArrowLeftRight
} from 'lucide-react';

export const DatabaseBackup: React.FC = () => {
  const [backups, setBackups] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isCreating, setIsCreating] = useState<boolean>(false);
  const [activeDropdownId, setActiveDropdownId] = useState<string | null>(null);
  const [selectedTypeFilter, setSelectedTypeFilter] = useState<string>('all');

  // Manual Backup Dialog State
  const [isCreateModalOpen, setIsCreateModalOpen] = useState<boolean>(false);
  const [backupNotes, setBackupNotes] = useState<string>('');

  // Restore Modal State
  const [isRestoreModalOpen, setIsRestoreModalOpen] = useState<boolean>(false);
  const [restoreTarget, setRestoreTarget] = useState<any | null>(null);
  const [isRestoring, setIsRestoring] = useState<boolean>(false);
  const [countdown, setCountdown] = useState<number>(3);
  
  // Password Verification State
  const [verifyPassword, setVerifyPassword] = useState<string>('');

  // Post-Restore Verification State
  const [isVerifying, setIsVerifying] = useState<boolean>(false);

  // Dropdown ref to auto-close menu on outside click
  const dropdownRef = useRef<HTMLDivElement | null>(null);

  // Fetch backups from Supabase on load
  const fetchBackups = async () => {
    try {
      setIsLoading(true);
      const { data, error } = await supabase
        .from('database_backups')
        .select('id, filename, notes, type, size_bytes, created_at')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setBackups(data || []);
    } catch (err: any) {
      console.warn('Failed to retrieve backups list:', err.message);
      toast.error('Failed to load backup history.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchBackups();
  }, []);

  // Manage countdown timer for Safety Restore confirmation
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

  // Handle clicking outside of open dropdown to close it
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setActiveDropdownId(null);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Trigger manual system backup point with custom notes
  const handleCreateBackup = async () => {
    try {
      setIsCreating(true);
      const customNoteText = backupNotes.trim() || 'Manual recovery point';
      const { error } = await supabase.rpc('generate_database_backup', {
        custom_notes: customNoteText,
        backup_type: 'manual'
      });

      if (error) throw error;

      // ─── AUDIT LOG: Backup Created ──────────────────────────────────────────
      await logAudit(
        'DATABASE_BACKUP_CREATED',
        `Created manual database backup checkpoint. Notes: "${customNoteText}".`
      );
      // ──────────────────────────────────────────────────────────────────────────

      toast.success('A new system backup has been successfully saved.');
      setIsCreateModalOpen(false);
      setBackupNotes('');
      fetchBackups();
    } catch (err: any) {
      toast.error(err.message || 'Failed to trigger backup.');
    } finally {
      setIsCreating(false);
    }
  };

  // Archive backup RPC trigger (Max 3)
  const handleArchiveBackup = async (backupId: string) => {
    try {
      const { error } = await supabase.rpc('archive_database_backup', {
        target_backup_id: backupId
      });

      if (error) throw error;

      const targetBackup = backups.find(b => b.id === backupId);
      const backupLabel = targetBackup ? (targetBackup.notes || targetBackup.filename) : 'Backup';

      // ─── AUDIT LOG: Backup Archived ─────────────────────────────────────────
      await logAudit(
        'DATABASE_BACKUP_ARCHIVED',
        `Archived database backup point: "${backupLabel}".`,
        backupId
      );
      // ──────────────────────────────────────────────────────────────────────────

      toast.success('Backup successfully archived (Rotation Limit: Max 3).');
      setActiveDropdownId(null);
      fetchBackups();
    } catch (err: any) {
      toast.error(err.message || 'Failed to archive backup.');
    }
  };

  // Unarchive backup RPC trigger (Enforces manual max 5 limit)
  const handleUnarchiveBackup = async (backupId: string) => {
    try {
      const { error } = await supabase.rpc('unarchive_database_backup', {
        target_backup_id: backupId
      });

      if (error) throw error;

      const targetBackup = backups.find(b => b.id === backupId);
      const backupLabel = targetBackup ? (targetBackup.notes || targetBackup.filename) : 'Backup';

      // ─── AUDIT LOG: Backup Unarchived ───────────────────────────────────────
      await logAudit(
        'DATABASE_BACKUP_UNARCHIVED',
        `Returned archived backup back to manual listings: "${backupLabel}".`,
        backupId
      );
      // ──────────────────────────────────────────────────────────────────────────

      toast.success('Backup successfully unarchived (Returned to manual list).');
      setActiveDropdownId(null);
      fetchBackups();
    } catch (err: any) {
      toast.error(err.message || 'Failed to unarchive backup.');
    }
  };

  const handleRestoreClick = (backup: any) => {
    setRestoreTarget(backup);
    setIsRestoreModalOpen(true);
  };

  // Perform actual system restore via database SQL function
  const handleConfirmRestore = async () => {
    if (!restoreTarget) return;
    
    if (!verifyPassword.trim()) {
      toast.error('Please enter your password to authorize this action.');
      return;
    }

    try {
      setIsRestoring(true);

      // 1. Password Verification via secure database-level RPC (Prevents client session/headers corruption)
      const { data: isValidPassword, error: authError } = await supabase.rpc('verify_user_password', {
        entered_password: verifyPassword
      });

      if (authError || !isValidPassword) {
        throw new Error('Authorization failed. Incorrect password.');
      }

      // 2. Erase any existing auto-safety backup first (Enforcing: There should only be one safety file)
      await supabase
        .from('database_backups')
        .delete()
        .eq('notes', 'Pre-Restore Backup (Auto-Safety)');

      // 3. Automatic Pre-Restore Safety Backup
      toast.info('Generating Pre-Restore Safety Backup...');
      const { error: safetyError } = await supabase.rpc('generate_database_backup', {
        custom_notes: 'Pre-Restore Backup (Auto-Safety)',
        backup_type: 'manual'
      });

      if (safetyError) {
        throw new Error(`Auto-Safety backup failed: ${safetyError.message}`);
      }

      // 4. Rollback Overwrite Restoration
      toast.info('Restoring database snapshot...');
      const { error: restoreError } = await supabase.rpc('restore_database_backup', { 
        target_backup_id: restoreTarget.id 
      });

      if (restoreError) throw restoreError;

      const targetBackupLabel = restoreTarget.notes || restoreTarget.filename;

      // ─── AUDIT LOG: Restoration Initiated ────────────────────────────────────
      await logAudit(
        'DATABASE_RESTORE_INITIATED',
        `Initiated rollback restoration to checkpoint: "${targetBackupLabel}". Awaiting commit confirmation.`,
        restoreTarget.id
      );
      // ──────────────────────────────────────────────────────────────────────────
      
      toast.success('System temporarily restored. Please verify the integrity of the data.');
      setIsRestoreModalOpen(false);
      setRestoreTarget(null);
      setVerifyPassword('');
      fetchBackups();
    } catch (err: any) {
      toast.error(err.message || 'Database restoration process failed.');
    } finally {
      setIsRestoring(false);
    }
  };

  // Revert Restoration (Restores Pre-Restore backup, then deletes it)
  const handleRevertRestoration = async (safetyBackupId: string) => {
    try {
      setIsVerifying(true);
      toast.info('Reverting database back to original state...');
      
      const { error: restoreError } = await supabase.rpc('restore_database_backup', { 
        target_backup_id: safetyBackupId 
      });

      if (restoreError) throw restoreError;

      // Delete the safety backup post rollback
      await supabase.from('database_backups').delete().eq('id', safetyBackupId);

      // ─── AUDIT LOG: Restoration Reverted ─────────────────────────────────────
      await logAudit(
        'DATABASE_RESTORE_REVERTED',
        'Reverted the recent database restoration. All modified files returned to original state.'
      );
      // ──────────────────────────────────────────────────────────────────────────
      
      toast.success('System successfully rolled back to your original state.');
      fetchBackups();
    } catch (err: any) {
      toast.error(err.message || 'Failed to revert restoration.');
    } finally {
      setIsVerifying(false);
    }
  };

  // Commit Restoration (Keeps changes, deletes Pre-Restore backup)
  const handleCommitRestoration = async (safetyBackupId: string) => {
    try {
      setIsVerifying(true);
      
      const { error } = await supabase.from('database_backups').delete().eq('id', safetyBackupId);
      if (error) throw error;

      // ─── AUDIT LOG: Restoration Committed ────────────────────────────────────
      await logAudit(
        'DATABASE_RESTORE_COMMITTED',
        'Committed restoration checkpoint modifications. Verification process complete.'
      );
      // ──────────────────────────────────────────────────────────────────────────

      toast.success('Changes successfully committed. Safety snapshot cleared.');
      fetchBackups();
    } catch (err: any) {
      toast.error(err.message || 'Failed to commit system files.');
    } finally {
      setIsRestoring(false);
      setIsVerifying(false);
    }
  };

  const formatSize = (bytes: number) => {
    if (!bytes || bytes === 0) return '0 B';
    if (bytes < 1024) {
      return `${bytes} B`;
    } else if (bytes < 1024 * 1024) {
      return `${(bytes / 1024).toFixed(1)} KB`;
    } else {
      return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    }
  };
  // Look for any existing auto-safety backup point
  const safetyBackupPoint = backups.find(b => b.notes === 'Pre-Restore Backup (Auto-Safety)');

  // Filter backups based on active select state
  const filteredBackups = backups.filter((b) => {
    // Hide safety backup from the general list to avoid cluttering human view
    if (b.notes === 'Pre-Restore Backup (Auto-Safety)') return false;
    
    if (selectedTypeFilter === 'all') return true;
    return b.type === selectedTypeFilter;
  });

  // Main UI Column definitions
  const columns: Column<any>[] = [
    {
      key: 'filename',
      header: 'BACKUP INFORMATION',
      sortable: true,
      render: (b) => {
        const dateObj = new Date(b.created_at);
        const dateStr = dateObj.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
        const timeStr = dateObj.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
        
        return (
          <div className="flex items-center gap-3.5 py-1">
            <div className={`p-2.5 rounded-xl border shrink-0 ${
              b.type === 'archived'
                ? 'bg-amber-500/10 border-amber-500/20 text-amber-500'
                : b.type === 'manual'
                  ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
                  : 'bg-(--color-primary)/10 border-(--color-primary)/10 text-(--color-primary-light)'
            }`}>
              <Database className="w-5.5 h-5.5" />
            </div>
            <div className="space-y-1">
              <span className="text-sm font-semibold text-(--color-text) block tracking-wide">
                Backup from {dateStr}
              </span>
              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-400 font-medium">
                  Today at {timeStr} (PHT)
                </span>
                {b.notes && (
                  <>
                    <span className="text-slate-600 font-bold">•</span>
                    <span className="text-xs text-(--color-text) opacity-85 italic font-medium max-w-sm truncate">
                      "{b.notes}"
                    </span>
                  </>
                )}
                {b.type === 'manual' && (
                  <span className="px-1.5 py-0.5 bg-emerald-500/10 text-[9px] text-emerald-400 border border-emerald-500/20 rounded-md font-bold tracking-wider uppercase scale-90">
                    Manual
                  </span>
                )}
              </div>
            </div>
          </div>
        );
      }
    },
    {
      key: 'type',
      header: 'TYPE',
      sortable: true,
      render: (b) => {
        if (b.type === 'archived') {
          return (
            <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-amber-500/10 text-[10px] text-amber-500 border border-amber-500/20 rounded-full font-bold tracking-wider uppercase">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
              ARCHIVED
            </span>
          );
        }
        if (b.type === 'manual') {
          return (
            <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-emerald-500/10 text-[10px] text-emerald-400 border border-emerald-500/20 rounded-full font-bold tracking-wider uppercase">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
              MANUAL
            </span>
          );
        }
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-blue-500/10 text-[10px] text-blue-500 dark:text-blue-400 border border-blue-500/20 rounded-full font-bold tracking-wider uppercase">
            <span className="w-1.5 h-1.5 rounded-full bg-blue-400" />
            AUTO
          </span>
        );
      }
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
        
        let friendlyAge = '';
        if (diffMins <= 5) {
          friendlyAge = 'Just now';
        } else if (diffMins < 60) {
          friendlyAge = `${diffMins} mins ago`;
        } else if (diffHours < 24) {
          friendlyAge = `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
        } else {
          friendlyAge = `${diffDays} day${diffDays > 1 ? 's' : ''} ago`;
        }
        
        return (
          <div className="flex items-center gap-1.5 text-(--color-text) opacity-85 font-medium">
            <Calendar className="w-4 h-4 opacity-70" />
            <span className="text-xs">{friendlyAge}</span>
          </div>
        );
      }
    },
    {
      key: 'size_bytes',
      header: 'SIZE',
      sortable: true,
      render: (b) => (
        <span className="text-xs text-(--color-text) font-mono font-medium opacity-85">
          {formatSize(b.size_bytes)}
        </span>
      )
    },
    {
      key: 'actions',
      header: 'ACTIONS',
      headerClassName: 'text-right',
      cellClassName: 'text-right',
      render: (b) => (
        <div className="flex items-center justify-end gap-3.5 relative">
          <button
            disabled={!!safetyBackupPoint}
            onClick={() => handleRestoreClick(b)}
            className="px-3.5 py-1.5 bg-(--color-primary)/10 hover:bg-(--color-primary) text-(--color-primary-light) hover:text-white text-[10px] font-heading tracking-wider uppercase rounded-lg transition-all cursor-pointer font-bold border border-(--color-primary)/20 disabled:opacity-30 disabled:cursor-not-allowed"
          >
            RESTORE
          </button>

          {/* 3-Dots Dropdown Trigger with Title & Label Attributes to satisfy Axe Diagnostics */}
          <div className="relative">
            <button
              onClick={() => setActiveDropdownId(activeDropdownId === b.id ? null : b.id)}
              className="p-1.5 text-slate-400 hover:text-(--color-text) rounded-lg hover:bg-(--bg-input) transition-colors cursor-pointer"
              title="Backup Options"
              aria-label="Toggle backup options menu"
            >
              <MoreVertical className="w-4.5 h-4.5" />
            </button>

            {/* Floating Dropdown Dialog (Removed Delete button option per requirements) */}
            {activeDropdownId === b.id && (
              <div 
                ref={dropdownRef}
                className="absolute right-0 mt-1.5 w-44 bg-(--bg-card) border border-(--border-color) rounded-xl shadow-2xl z-50 py-1.5 text-left animate-slide-up"
              >
                {b.type !== 'archived' ? (
                  <button
                    onClick={() => handleArchiveBackup(b.id)}
                    className="w-full px-3.5 py-2 hover:bg-(--bg-input) text-(--color-text) opacity-85 hover:opacity-100 text-xs font-semibold flex items-center gap-2.5 transition-colors cursor-pointer"
                  >
                    <Archive className="w-4 h-4 text-amber-500" />
                    Archive Backup
                  </button>
                ) : (
                  <button
                    onClick={() => handleUnarchiveBackup(b.id)}
                    className="w-full px-3.5 py-2 hover:bg-(--bg-input) text-(--color-text) opacity-85 hover:opacity-100 text-xs font-semibold flex items-center gap-2.5 transition-colors cursor-pointer"
                  >
                    <Archive className="w-4 h-4 text-emerald-450 rotate-180" />
                    Unarchive Backup
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      )
    }
  ];

  return (
    <div className="space-y-8 font-body min-h-screen text-(--color-text) rounded-3xl">
      
      {/* ⚠️ POST-RESTORE SYSTEM VERIFICATION FLOATING PORTAL CARD */}
      {safetyBackupPoint && (
        <div className="p-5 bg-amber-500/5 border border-amber-500/30 rounded-2xl flex flex-col md:flex-row md:items-center justify-between gap-4 animate-slide-up shadow-lg">
          <div className="flex items-start gap-3.5">
            <div className="p-3 bg-amber-500/10 rounded-xl text-amber-500 border border-amber-500/20 shrink-0">
              <ArrowLeftRight className="w-6 h-6 animate-pulse" />
            </div>
            <div className="space-y-1">
  <h4 className="text-sm font-heading tracking-wide text-amber-500 uppercase">
    Backup Restored Successfully
  </h4>
  <p className="text-xs text-slate-400 font-semibold leading-relaxed">
    Your backup has been restored. Please take a few moments to check your members, payments, schedules, and other records to make sure everything looks correct.
  </p>
</div>
          </div>
          <div className="flex items-center gap-3 shrink-0 self-end sm:self-center">
            {/* Revert Rollback Action */}
            <button
              disabled={isVerifying}
              onClick={() => handleRevertRestoration(safetyBackupPoint.id)}
              className="px-4 py-2 border border-red-500/30 bg-red-500/10 hover:bg-red-600 text-red-400 hover:text-white text-[10px] font-heading tracking-wider uppercase rounded-lg transition-all cursor-pointer font-bold disabled:opacity-50"
            >
              {isVerifying ? 'Reverting...' : 'Revert Changes'}
            </button>
            {/* Commit All Good Action */}
            <button
              disabled={isVerifying}
              onClick={() => handleCommitRestoration(safetyBackupPoint.id)}
              className="px-4 py-2 bg-emerald-500 hover:bg-emerald-600 text-white text-[10px] font-heading tracking-wider uppercase rounded-lg transition-all cursor-pointer font-bold disabled:opacity-50"
            >
              {isVerifying ? 'Saving...' : 'Confirm Changes'}
            </button>
          </div>
        </div>
      )}

      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-heading tracking-widest uppercase text-(--color-text)">
            SYSTEM BACKUPS
          </h2>
          <p className="text-sm text-slate-400 mt-1 font-medium">
            Create and manage backups to protect your system data, settings, and accounts.
          </p>
        </div>
        
        <div className="flex items-center gap-3">
          <button
            onClick={() => setIsCreateModalOpen(true)}
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-emerald-500 text-white hover:bg-emerald-600 text-[10px] font-heading tracking-widest uppercase rounded-lg transition-all cursor-pointer shadow-lg shadow-emerald-500/10"
          >
            <PlusCircle className="w-3.5 h-3.5" />
            SAVE TODAY'S BACKUP
          </button>
        </div>
      </div>

      {/* KPI Info Widgets - Hidden on mobile viewports */}
      <div className="hidden md:grid grid-cols-1 md:grid-cols-3 gap-5">
        <div className="p-5 bg-(--bg-card) border border-(--border-color) rounded-2xl flex items-center gap-4">
          <div className="p-3 bg-emerald-500/10 rounded-xl text-emerald-450 border border-emerald-500/20">
            <Database className="w-6 h-6 text-emerald-500" />
          </div>
          <div>
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">AVAILABLE RECOVERY POINTS</span>
            <span className="text-lg font-extrabold text-(--color-text) font-heading tracking-wide mt-0.5 block">
              {filteredBackups.length} RECOVERY FILES
            </span>
            <span className="text-[10px] font-bold text-slate-500 block mt-0.5">Across 7 days</span>
          </div>
        </div>

        <div className="p-5 bg-(--bg-card) border border-(--border-color) rounded-2xl flex items-center gap-4">
          <div className="p-3 bg-amber-500/10 rounded-xl text-amber-500 border border-amber-500/20">
            <RefreshCw className="w-6 h-6" />
          </div>
          <div>
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">AUTOMATION SCHEDULE</span>
            <span className="text-lg font-extrabold text-(--color-text) font-heading tracking-wider mt-0.5 block">
              EVERY 24 HOURS
            </span>
            <span className="text-[10px] font-bold text-slate-500 block mt-0.5">Next backup: Tomorrow, 8:00 AM</span>
          </div>
        </div>

        <div className="p-5 bg-(--bg-card) border border-(--border-color) rounded-2xl flex items-center gap-4">
          <div className="p-3 bg-blue-500/10 rounded-xl text-blue-500 border border-blue-500/20">
            <CheckCircle2 className="w-6 h-6" />
          </div>
          <div>
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">RETENTION POLICY</span>
            <span className="text-lg font-extrabold text-(--color-text) font-heading tracking-wider mt-0.5 block">
              7 DAY ROTATION
            </span>
            <span className="text-[10px] font-bold text-slate-500 block mt-0.5">Auto-delete after 7 days</span>
          </div>
        </div>
      </div>

      {/* Filter Options & Search Block */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-(--bg-card) p-4 rounded-2xl border border-(--border-color)">
        <div className="relative flex-1 max-w-md">
          <input
            type="text"
            placeholder="Search backups..."
            className="w-full pl-10 pr-4 py-2 border border-(--border-color) rounded-xl bg-(--bg-page) text-sm text-(--color-text) outline-none focus:border-slate-400 transition-all font-medium"
          />
          <Database className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
        </div>

        <div className="flex items-center gap-2">
          <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Filter:</span>
          {/* Accessible Select elements with titles to address edge warnings */}
          <select
            value={selectedTypeFilter}
            onChange={(e) => setSelectedTypeFilter(e.target.value)}
            title="Filter backups by type"
            aria-label="Filter backups by type"
            className="px-3.5 py-2 bg-(--bg-page) border border-(--border-color) rounded-xl text-xs text-(--color-text) font-semibold outline-none focus:border-slate-400 transition-all"
          >
            <option value="all">All Types</option>
            <option value="manual">Manual Backups</option>
            <option value="auto">Automated Backups</option>
            <option value="archived">Archived Backups</option>
          </select>
        </div>
      </div>

      {/* Main Table Interface with responsive scroll settings */}
      <div className="p-1 rounded-2xl border border-(--border-color) bg-(--bg-card) overflow-x-auto lg:overflow-x-visible w-full">
        <Table<any>
          data={filteredBackups}
          columns={columns}
          searchKeys={['filename']}
          searchPlaceholder="Search saved backups history..."
          defaultSortKey="created_at"
          defaultSortDirection="desc"
          itemsPerPage={useResponsiveItemsPerPage()}
          loading={isLoading}
          loadingLabel="Accessing system backup files..."
        />
      </div>

      {/* Reassuring Amber Warning Box */}
      <div className="flex items-start gap-4 p-5 bg-amber-500/5 border border-amber-500/20 rounded-2xl text-xs text-amber-500 leading-normal max-w-full">
        <Info className="w-5 h-5 shrink-0 mt-0.5 text-amber-500" />
        <div className="space-y-1.5 text-left">
          <p className="font-heading tracking-wider uppercase text-xs">Automated Daily Backups Information</p>
          <p className="text-[11px] font-semibold text-slate-400 opacity-90 leading-relaxed">
            The system automatically creates backups every 24 hours. Only the last 7 days are kept to save storage space. You can archive up to 3 backups to save them indefinitely. Storing more than 5 manual backups or 3 archived backups automatically deletes the oldest manual or archived file.
          </p>
        </div>
      </div>

      {/* Dialog: Save Manual Backup with Custom Notes */}
      <Modal
        isOpen={isCreateModalOpen}
        onClose={() => {
          setIsCreateModalOpen(false);
          setBackupNotes('');
        }}
        title="Save Today's Backup Point"
      >
        <div className="space-y-4 font-body text-left">
          <p className="text-xs text-slate-400 leading-normal font-semibold">
            Specify a custom note below so you can identify why this backup was created (e.g., "Before changing Boxing subscription rates").
          </p>

          <div className="grid gap-1.5 pt-1">
            <label htmlFor="notesInput" className="text-xs font-bold uppercase tracking-wider text-slate-300">
              Backup Notes (Optional)
            </label>
            <input
              id="notesInput"
              type="text"
              maxLength={120}
              placeholder="Write a custom description..."
              value={backupNotes}
              onChange={(e) => setBackupNotes(e.target.value)}
              className="w-full px-4 py-2.5 border border-(--border-color) rounded-lg text-sm bg-(--bg-page) text-(--color-text) outline-none focus:ring-1 focus:ring-emerald-500 transition-all font-medium"
            />
          </div>

          <div className="flex gap-3 pt-2">
            <Button
              variant="secondary"
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
              className="bg-emerald-600 text-white hover:bg-emerald-700 font-heading text-xs tracking-wider uppercase shadow-md cursor-pointer border-emerald-600"
            >
              Create Recovery Point
            </Button>
          </div>
        </div>
      </Modal>

      {/* Real Restore Confirmation Portal */}
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
            {/* Red alert card featuring warning description and exclamation mark icon */}
            <div className="p-4 bg-red-500/5 border border-red-500/20 text-red-500 rounded-xl flex items-start gap-3.5 text-xs font-bold leading-snug">
              <ShieldAlert className="w-8 h-8 shrink-0 text-red-500 mt-0.5" />
              <div className="space-y-1">
                <span className="block font-heading tracking-wider uppercase text-[10px]">CRITICAL RESTORE WARNING</span>
                <span className="block text-slate-300 font-semibold leading-relaxed">
                  Restoring this backup will replace all current data. This action cannot be undone.
                </span>
              </div>
            </div>

            <div className="space-y-2">
              <p className="text-xs text-slate-300 leading-normal font-semibold">
                This process will restore the database to its exact state on:
              </p>
              <strong className="block text-xs text-(--color-text) font-extrabold bg-(--bg-page) p-3 rounded-lg border border-(--border-color)">
                {new Date(restoreTarget.created_at).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}{' '}
                at {new Date(restoreTarget.created_at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })}
              </strong>
            </div>

            {/* Password input verification card */}
            <div className="grid gap-1.5 pt-1">
              <label htmlFor="verifyPasswordInput" className="text-xs font-bold uppercase tracking-wider text-(--color-text) flex items-center gap-1.5">
                <Lock className="w-3.5 h-3.5 text-red-500" />
                Confirm Admin Password
              </label>
              <input
                id="verifyPasswordInput"
                type="password"
                disabled={isRestoring}
                placeholder="Enter your password to authorize rollback..."
                value={verifyPassword}
                onChange={(e) => setVerifyPassword(e.target.value)}
                className="w-full px-4 py-2.5 border border-(--border-color) rounded-lg text-sm bg-(--bg-page) text-(--color-text) outline-none focus:ring-1 focus:ring-red-500 transition-all font-medium disabled:opacity-50"
              />
            </div>

            <div className="flex gap-3 pt-2">
              <Button
                variant="secondary"
                disabled={isRestoring}
                onClick={() => {
                  setIsRestoreModalOpen(false);
                  setRestoreTarget(null);
                  setVerifyPassword('');
                }}
              >
                Cancel
              </Button>
              <Button
                onClick={handleConfirmRestore}
                loading={isRestoring}
                disabled={countdown > 0 || isRestoring || !verifyPassword.trim()}
                loadingLabel="RESTORING SYSTEM..."
                className={`text-white font-heading text-xs tracking-wider uppercase shadow-md cursor-pointer ${
                  countdown > 0 || !verifyPassword.trim()
                    ? 'bg-slate-800 cursor-not-allowed border-slate-800 text-slate-500' 
                    : 'bg-red-600 hover:bg-red-700 border-red-600'
                }`}
              >
                {isRestoring 
                  ? 'Restoring system...' 
                  : countdown > 0 
                    ? `Confirm Restore (${countdown}s)` 
                    : 'Confirm Restore'
                }
              </Button>
            </div>
          </div>
        )}
      </Modal>

    </div>
  );
};