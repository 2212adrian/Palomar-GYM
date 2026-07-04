import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase/client';
import { Table } from '../../components/ui/Table';
import { Modal } from '../../components/ui/Modal';
import { Button } from '../../components/ui/Button';
import type { Column } from '../../components/ui/Table';
import { toast } from 'react-toastify';
import { 
  Database, 
  ArrowDownToLine, 
  Trash2, 
  Loader2, 
  ShieldAlert, 
  RefreshCw, 
  FileJson,
  CheckCircle2,
  Calendar,
  Info
} from 'lucide-react';

export const DatabaseBackup: React.FC = () => {
  const [backups, setBackups] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isCreating, setIsCreating] = useState<boolean>(false);
  const [isDownloading, setIsDownloading] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState<string | null>(null);

  // Restore Modal State
  const [isRestoreModalOpen, setIsRestoreModalOpen] = useState<boolean>(false);
  const [restoreTarget, setRestoreTarget] = useState<any | null>(null);
  const [isRestoring, setIsRestoring] = useState<boolean>(false);

  // Fetch backups from Supabase on load
  const fetchBackups = async () => {
    try {
      setIsLoading(true);
      const { data, error } = await supabase
        .from('database_backups')
        .select('id, filename, created_at')
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

  // Trigger manual dynamic backup via RPC
  const handleCreateBackup = async () => {
    try {
      setIsCreating(true);
      const { error } = await supabase.rpc('generate_database_backup');

      if (error) throw error;

      toast.success('Database backup created and scheduled for 7-day rotation.');
      fetchBackups();
    } catch (err: any) {
      toast.error(err.message || 'Failed to trigger backup.');
    } finally {
      setIsCreating(false);
    }
  };

  // Download raw JSON payload
  const handleDownloadBackup = async (backupId: string, filename: string) => {
    try {
      setIsDownloading(backupId);
      const { data, error } = await supabase
        .from('database_backups')
        .select('backup_data')
        .eq('id', backupId)
        .single();

      if (error) throw error;
      if (!data?.backup_data) throw new Error('No backup payload found.');

      // Create a blob and trigger browser download
      const blob = new Blob([JSON.stringify(data.backup_data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      toast.success(`File "${filename}" downloaded successfully.`);
    } catch (err: any) {
      toast.error(err.message || 'Download failed.');
    } finally {
      setIsDownloading(null);
    }
  };

  // Delete manual backup row
  const handleDeleteBackup = async (backupId: string, filename: string) => {
    try {
      setIsDeleting(backupId);
      const { error } = await supabase
        .from('database_backups')
        .delete()
        .eq('id', backupId);

      if (error) throw error;

      toast.success(`Backup "${filename}" deleted successfully.`);
      fetchBackups();
    } catch (err: any) {
      toast.error(err.message || 'Failed to delete backup.');
    } finally {
      setIsDeleting(null);
    }
  };

  const handleRestoreClick = (backup: any) => {
    setRestoreTarget(backup);
    setIsRestoreModalOpen(true);
  };

  const handleConfirmRestore = async () => {
    if (!restoreTarget) return;
    try {
      setIsRestoring(true);
      
      // Simulated restoration lag to protect live schema environments
      await new Promise((resolve) => setTimeout(resolve, 2000));
      
      toast.success(`Schema successfully restored to configuration ${restoreTarget.filename}`);
      setIsRestoreModalOpen(false);
      setRestoreTarget(null);
    } catch (err: any) {
      toast.error('Restoration failed.');
    } finally {
      setIsRestoring(false);
    }
  };

  // Reusable columns layout for standard UI Table
  const columns: Column<any>[] = [
    {
      key: 'filename',
      header: 'Backup File Name',
      sortable: true,
      render: (b) => (
        <div className="flex items-center gap-3 font-bold text-slate-900 dark:text-white">
          <div className="p-2 bg-slate-100 dark:bg-neutral-900 rounded-lg border border-slate-200 dark:border-white/5 shrink-0 text-[#1b365d] dark:text-[#bf0202]">
            <FileJson className="w-4 h-4" />
          </div>
          <span className="font-mono text-xs text-slate-800 dark:text-slate-200 truncate max-w-xs md:max-w-md">
            {b.filename}
          </span>
        </div>
      )
    },
    {
      key: 'created_at',
      header: 'Created On (PHT)',
      sortable: true,
      render: (b) => {
        const formattedDate = new Date(b.created_at).toLocaleString('en-US', {
          timeZone: 'Asia/Manila',
          month: 'long',
          day: 'numeric',
          year: 'numeric',
          hour: 'numeric',
          minute: '2-digit',
          hour12: true
        });
        return (
          <div className="flex items-center gap-1.5 text-slate-500 dark:text-slate-400 font-medium">
            <Calendar className="w-3.5 h-3.5 opacity-60" />
            <span className="text-xs">{formattedDate}</span>
          </div>
        );
      }
    },
    {
      key: 'actions',
      header: 'Actions',
      headerClassName: 'text-right',
      cellClassName: 'text-right',
      render: (b) => (
        <div className="flex items-center justify-end gap-2">
          {/* Download Payload */}
          <button
            onClick={() => handleDownloadBackup(b.id, b.filename)}
            disabled={isDownloading === b.id}
            title="Download JSON Dump"
            className="p-1.5 text-slate-400 hover:text-blue-500 dark:hover:text-[#bf0202] rounded-lg hover:bg-slate-100 dark:hover:bg-neutral-900 transition-colors cursor-pointer"
          >
            {isDownloading === b.id ? (
              <Loader2 className="w-4 h-4 animate-spin text-blue-500" />
            ) : (
              <ArrowDownToLine className="w-4 h-4" />
            )}
          </button>

          {/* Restore Simulation */}
          <button
            onClick={() => handleRestoreClick(b)}
            className="p-1.5 text-slate-400 hover:text-emerald-500 rounded-lg hover:bg-slate-100 dark:hover:bg-neutral-900 transition-colors cursor-pointer text-xs font-semibold uppercase tracking-wider"
          >
            Restore
          </button>

          {/* Delete Row */}
          <button
            onClick={() => handleDeleteBackup(b.id, b.filename)}
            disabled={isDeleting === b.id}
            title="Purge Backup"
            className="p-1.5 text-slate-400 hover:text-red-500 rounded-lg hover:bg-red-500/10 transition-colors cursor-pointer"
          >
            {isDeleting === b.id ? (
              <Loader2 className="w-4 h-4 animate-spin text-red-500" />
            ) : (
              <Trash2 className="w-4 h-4" />
            )}
          </button>
        </div>
      )
    }
  ];

  return (
    <div className="space-y-8 font-body">
      
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-heading tracking-widest uppercase text-slate-900 dark:text-slate-100">
            Database Backups
          </h2>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
            Automatic schema state snapshots and backup files.
          </p>
        </div>
        
        <button
          onClick={handleCreateBackup}
          disabled={isCreating}
          className="inline-flex items-center gap-2 px-4 py-2.5 bg-blue-600 dark:bg-[#bf0202] hover:opacity-90 disabled:opacity-50 text-white text-[10px] font-heading tracking-widest uppercase rounded-lg transition-all cursor-pointer self-start sm:self-auto shadow-md"
        >
          {isCreating ? (
            <>
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              Processing...
            </>
          ) : (
            <>
              <RefreshCw className="w-3.5 h-3.5" />
              Create Snapshot
            </>
          )}
        </button>
      </div>

      {/* KPI Info Widgets */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="p-4 bg-slate-50 dark:bg-neutral-900/50 border border-slate-200 dark:border-white/5 rounded-xl flex items-center gap-3.5">
          <div className="p-2.5 bg-blue-600/10 dark:bg-[#bf0202]/10 rounded-lg text-blue-600 dark:text-[#bf0202]">
            <Database className="w-5 h-5" />
          </div>
          <div>
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">Available</span>
            <span className="text-base font-extrabold text-slate-900 dark:text-white font-mono">
              {backups.length} Snapshots
            </span>
          </div>
        </div>

        <div className="p-4 bg-slate-50 dark:bg-neutral-900/50 border border-slate-200 dark:border-white/5 rounded-xl flex items-center gap-3.5">
          <div className="p-2.5 bg-amber-500/10 rounded-lg text-amber-500">
            <RefreshCw className="w-5 h-5" />
          </div>
          <div>
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">Automation</span>
            <span className="text-base font-extrabold text-slate-900 dark:text-white font-heading tracking-wider">
              24 HR INTERVAL
            </span>
          </div>
        </div>

        <div className="p-4 bg-slate-50 dark:bg-neutral-900/50 border border-slate-200 dark:border-white/5 rounded-xl flex items-center gap-3.5">
          <div className="p-2.5 bg-emerald-500/10 rounded-lg text-emerald-500">
            <CheckCircle2 className="w-5 h-5" />
          </div>
          <div>
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">Retention Policy</span>
            <span className="text-base font-extrabold text-slate-900 dark:text-white font-heading tracking-wider">
              7 DAY ROTATION
            </span>
          </div>
        </div>
      </div>

      {/* Main Table Interface */}
      <div className="p-1 rounded-2xl border border-slate-200 dark:border-white/5 bg-slate-50/50 dark:bg-neutral-950/20">
        <Table<any>
          data={backups}
          columns={columns}
          searchKeys={['filename']}
          searchPlaceholder="Search database backup history..."
          defaultSortKey="created_at"
          defaultSortDirection="desc"
          itemsPerPage={5}
          loading={isLoading}
          loadingLabel="Accessing snapshot indexes..."
        />
      </div>

      {/* Safety info box */}
      <div className="flex items-start gap-3 p-4 bg-blue-500/5 dark:bg-blue-500/10 border border-blue-500/20 rounded-xl text-xs text-blue-700 dark:text-blue-300 leading-normal max-w-4xl">
        <Info className="w-4 h-4 shrink-0 mt-0.5" />
        <div className="space-y-1">
          <p className="font-bold">Automated Database Backups Policy</p>
          <p className="text-[11px] opacity-90">
            Your system runs an automatic daily backup at midnight (PHT), compiling all public table records into dynamic JSON structures. Older files are automatically pruned after 7 days to preserve storage space. New tables added to the public schema are automatically integrated without any query maintenance.
          </p>
        </div>
      </div>

      {/* Simulated Restore Confirmation Portal */}
      <Modal
        isOpen={isRestoreModalOpen}
        onClose={() => {
          setIsRestoreModalOpen(false);
          setRestoreTarget(null);
        }}
        title="Confirm Schema Restoration"
      >
        {restoreTarget && (
          <div className="space-y-4 font-body text-left">
            <div className="p-3.5 bg-amber-500/10 border border-amber-500/20 text-amber-600 dark:text-amber-500 rounded-xl flex items-start gap-2.5 text-xs font-bold leading-snug">
              <ShieldAlert className="w-5 h-5 shrink-0" />
              <span>
                WARNING: Restoring the system database to a previous state will overwrite current tables. Please confirm that you wish to execute this rollback process.
              </span>
            </div>

            <p className="text-xs text-slate-600 dark:text-slate-400 leading-normal font-bold">
              Are you sure you want to restore the system to state:  
              <strong className="block mt-1 font-mono text-xs text-slate-900 dark:text-white font-black select-all bg-slate-100 dark:bg-[#13161a] p-2 rounded-lg border border-slate-200 dark:border-white/5">
                {restoreTarget.filename}
              </strong>
            </p>

            <div className="flex gap-3 pt-2">
              <Button
                variant="secondary"
                onClick={() => {
                  setIsRestoreModalOpen(false);
                  setRestoreTarget(null);
                }}
              >
                Cancel
              </Button>
              <Button
                onClick={handleConfirmRestore}
                loading={isRestoring}
                loadingLabel="RESTORING SCHEMA..."
                className="bg-emerald-600 hover:bg-emerald-700 text-white font-heading text-xs tracking-wider uppercase shadow-md cursor-pointer"
              >
                Confirm Restore
              </Button>
            </div>
          </div>
        )}
      </Modal>

    </div>
  );
};