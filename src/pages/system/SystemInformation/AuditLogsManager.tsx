import React, { useState } from 'react';
import { Table, type Column } from '../../../components/ui/Table';
import { Modal } from '../../../components/ui/Modal';
import { Button } from '../../../components/ui/Button';
import { Eye, Trash2, AlertTriangle, RefreshCw } from 'lucide-react';
import { toast } from 'react-toastify';
import { supabase } from '../../../lib/supabase/client';
import { logAudit } from '../../../lib/supabase/audit';

interface AuditLogsManagerProps {
  auditLogsList: any[];
  loading: boolean;
  isSuperAdmin: boolean;
  onRefresh: () => void;
}

export const AuditLogsManager: React.FC<AuditLogsManagerProps> = ({
  auditLogsList,
  loading,
  isSuperAdmin,
  onRefresh,
}) => {
  const [selectedLog, setSelectedLog] = useState<any | null>(null);
  const [purgeModalOpen, setPurgeModalOpen] = useState(false);
  const [purgeYear, setPurgeYear] = useState('2025');
  const [purging, setPurging] = useState(false);

  const handleDeleteLog = async (log: any) => {
    if (!isSuperAdmin) return;
    if (!window.confirm(`Permanently delete audit event "${log.action}"?`))
      return;

    try {
      const { error } = await supabase
        .from('audit_logs')
        .delete()
        .eq('id', log.id);
      if (error) throw error;
      toast.success('Audit log deleted');
      onRefresh();
    } catch (err: any) {
      toast.error('Error deleting log: ' + err.message);
    }
  };

  const handleExecutePurge = async () => {
    if (!isSuperAdmin) return;
    setPurging(true);
    try {
      let cutoffIso = '';
      let label = '';
      if (purgeYear === '2025') {
        cutoffIso = '2026-01-01T00:00:00+08:00';
        label = '2025 & prior historical logs';
      } else if (purgeYear === '180days') {
        const d = new Date();
        d.setDate(d.getDate() - 180);
        cutoffIso = d.toISOString();
        label = 'Logs older than 180 days';
      } else {
        const d = new Date();
        d.setDate(d.getDate() - 365);
        cutoffIso = d.toISOString();
        label = 'Logs older than 1 year';
      }

      const { error } = await supabase
        .from('audit_logs')
        .delete()
        .lt('created_at', cutoffIso);
      if (error) throw error;

      toast.success(`Purged ${label} successfully`);
      await logAudit('SUPERADMIN_AUDIT_PURGE', `Purged storage (${label})`);
      setPurgeModalOpen(false);
      onRefresh();
    } catch (err: any) {
      toast.error(err.message || 'Purge failed');
    } finally {
      setPurging(false);
    }
  };

  const auditColumns: Column<any>[] = [
    {
      key: 'action',
      header: 'Event & Operator',
      sortable: true,
      render: (item) => (
        <div className="space-y-1 py-1 text-left">
          <span className="font-mono text-xs font-black text-blue-600 dark:text-red-400 block">
            {item.action}
          </span>
          <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-slate-100 dark:bg-neutral-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-white/10">
            {item.actor_username || 'System'}
          </span>
        </div>
      ),
    },
    {
      key: 'details',
      header: 'Event Context & Payload',
      render: (item) => (
        <span className="text-xs text-slate-600 dark:text-slate-300 max-w-sm sm:max-w-md truncate block text-left">
          {item.details || 'System event recorded.'}
        </span>
      ),
    },
    {
      key: 'created_at',
      header: 'Recorded Time (PHT)',
      sortable: true,
      render: (item) => (
        <span className="text-[11px] font-mono text-slate-500 dark:text-slate-400 whitespace-nowrap">
          {new Date(item.created_at).toLocaleString('en-US', {
            timeZone: 'Asia/Manila',
            month: 'short',
            day: 'numeric',
            year: 'numeric',
            hour: 'numeric',
            minute: '2-digit',
            hour12: true,
          })}
        </span>
      ),
    },
    {
      key: 'view',
      header: 'Actions',
      render: (item) => (
        <div className="flex items-center gap-1.5 justify-end">
          <button
            type="button"
            onClick={() => setSelectedLog(item)}
            className="p-1.5 rounded-lg border border-slate-200 dark:border-white/10 hover:bg-slate-100 dark:hover:bg-neutral-800 text-slate-600 dark:text-slate-300 cursor-pointer"
            title="View Details"
          >
            <Eye className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => handleDeleteLog(item)}
            className="p-1.5 rounded-lg border border-slate-200 dark:border-white/10 hover:bg-red-50 dark:hover:bg-red-950/40 text-red-600 dark:text-red-400 cursor-pointer"
            title="Delete Log"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-xs text-blue-600 dark:text-blue-400 font-semibold">
          Showing {auditLogsList.length} live system audit entries
        </span>
        <button
          type="button"
          onClick={() => setPurgeModalOpen(true)}
          className="py-1.5 px-3 rounded-xl bg-red-600 hover:bg-red-700 text-white font-heading font-bold text-xs uppercase tracking-wider flex items-center gap-1.5 cursor-pointer shadow-xs transition-all"
        >
          <Trash2 className="w-3.5 h-3.5" />
          <span>Clean Storage (Purge Logs)</span>
        </button>
      </div>

      <Table
        data={auditLogsList}
        columns={auditColumns}
        searchKeys={['action', 'actor_username', 'details', 'target_id']}
        searchPlaceholder="Search audit events, usernames, actions..."
        loading={loading}
        itemsPerPage={10}
      />

      <Modal
        isOpen={!!selectedLog}
        onClose={() => setSelectedLog(null)}
        title="Audit Log Details"
        className="max-w-lg w-full p-5"
      >
        {selectedLog && (
          <div className="space-y-3.5 text-xs text-left">
            <div className="grid grid-cols-2 gap-3 p-3 rounded-xl bg-slate-50 dark:bg-neutral-800 border border-slate-200 dark:border-white/10">
              <div>
                <span className="text-[10px] uppercase font-bold text-slate-400 block">
                  Action
                </span>
                <span className="font-mono font-bold text-blue-600 dark:text-red-400">
                  {selectedLog.action}
                </span>
              </div>
              <div>
                <span className="text-[10px] uppercase font-bold text-slate-400 block">
                  Operator
                </span>
                <span className="font-semibold text-slate-900 dark:text-white">
                  {selectedLog.actor_username || 'System'}
                </span>
              </div>
            </div>

            <div>
              <span className="text-[10px] uppercase font-bold text-slate-400 block mb-1">
                Payload Context
              </span>
              <div className="p-3 rounded-xl bg-slate-50 dark:bg-black/30 border border-slate-200 dark:border-white/10 text-slate-700 dark:text-slate-300 font-mono text-[11px] leading-relaxed whitespace-pre-wrap select-all">
                {selectedLog.details || 'No extended details.'}
              </div>
            </div>

            <div className="flex justify-end pt-2 border-t border-slate-100 dark:border-white/10">
              <Button
                type="button"
                variant="secondary"
                onClick={() => setSelectedLog(null)}
              >
                Close
              </Button>
            </div>
          </div>
        )}
      </Modal>

      <Modal
        isOpen={purgeModalOpen}
        onClose={() => !purging && setPurgeModalOpen(false)}
        title="Reclaim Database Storage (Purge Logs)"
        className="max-w-md w-full p-5 text-left"
      >
        <div className="space-y-4 text-xs text-slate-700 dark:text-slate-300">
          <div className="p-3.5 rounded-xl bg-red-500/10 border border-red-500/20 text-red-700 dark:text-red-400 flex items-start gap-2.5">
            <AlertTriangle className="w-5 h-5 shrink-0 text-red-500 mt-0.5" />
            <p className="text-[11px] leading-relaxed">
              Purging historical logs permanently frees Postgres row storage
              quota.
            </p>
          </div>

          <div className="space-y-2">
            <label className="flex items-center gap-2.5 p-3 rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-neutral-800 cursor-pointer">
              <input
                type="radio"
                name="purge"
                value="2025"
                checked={purgeYear === '2025'}
                onChange={(e) => setPurgeYear(e.target.value)}
              />
              <div>
                <span className="font-bold text-slate-900 dark:text-white block">
                  Delete 2025 &amp; Prior
                </span>
                <span className="text-[10px] text-slate-400">
                  Purges records before Jan 1, 2026.
                </span>
              </div>
            </label>

            <label className="flex items-center gap-2.5 p-3 rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-neutral-800 cursor-pointer">
              <input
                type="radio"
                name="purge"
                value="180days"
                checked={purgeYear === '180days'}
                onChange={(e) => setPurgeYear(e.target.value)}
              />
              <div>
                <span className="font-bold text-slate-900 dark:text-white block">
                  Older than 180 Days
                </span>
              </div>
            </label>
          </div>

          <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100 dark:border-white/10">
            <button
              type="button"
              disabled={purging}
              onClick={() => setPurgeModalOpen(false)}
              className="px-4 py-2 rounded-xl border border-slate-200 dark:border-white/10 text-slate-700 dark:text-slate-300 font-bold"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={purging}
              onClick={handleExecutePurge}
              className="px-4 py-2 rounded-xl bg-red-600 hover:bg-red-700 text-white font-bold flex items-center gap-1.5"
            >
              {purging ? (
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Trash2 className="w-3.5 h-3.5" />
              )}
              <span>Confirm Purge</span>
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
};
