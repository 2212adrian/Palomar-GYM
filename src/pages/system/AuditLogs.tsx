import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase/client';
import { Table } from '../../components/ui/Table';
import type { Column } from '../../components/ui/Table';
import { toast } from 'react-toastify';
import { 
  FileText, 
  RefreshCw, 
  Loader2, 
  ShieldCheck, 
  Users, 
  Calendar,
  AlertTriangle
} from 'lucide-react';

export const AuditLogs: React.FC = () => {
  const [logs, setLogs] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);

  // Fetch security audit logs directly from Supabase
  const fetchLogs = async () => {
    try {
      setIsLoading(true);
      const { data, error } = await supabase
        .from('audit_logs')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setLogs(data || []);
    } catch (err: any) {
      console.warn('Failed to retrieve system logs:', err.message);
      toast.error('Failed to load system audit history.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs();
  }, []);

  // Maps action types to contextual color badges for clean visual scanning
  const getActionBadgeClass = (action: string) => {
    const act = action.toUpperCase();
    if (act.includes('CHECK_IN') || act.includes('CHECK_OUT') || act.includes('LOGBOOK')) {
      return 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20';
    }
    if (act.includes('DELETE') || act.includes('PURGE') || act.includes('ALERT') || act.includes('CLEANUP')) {
      return 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20';
    }
    if (act.includes('UPDATE') || act.includes('CONFIG') || act.includes('SAVE') || act.includes('REGISTER')) {
      return 'bg-amber-500/10 text-amber-600 dark:text-amber-500 border border-amber-500/20';
    }
    return 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20';
  };

  // Reusable columns configuration for standard UI Table
  const columns: Column<any>[] = [
    {
      key: 'created_at',
      header: 'Timestamp (PHT)',
      sortable: true,
      render: (log) => {
        const formattedDate = new Date(log.created_at).toLocaleString('en-US', {
          timeZone: 'Asia/Manila',
          month: 'short',
          day: 'numeric',
          year: 'numeric',
          hour: 'numeric',
          minute: '2-digit',
          second: '2-digit',
          hour12: true
        });
        return (
          <div className="flex items-center gap-1.5 text-slate-500 dark:text-slate-400 font-mono text-[11px] whitespace-nowrap">
            <Calendar className="w-3.5 h-3.5 opacity-60" />
            <span>{formattedDate}</span>
          </div>
        );
      }
    },
    {
      key: 'actor_username',
      header: 'Actor',
      sortable: true,
      render: (log) => (
        <span className="font-bold text-slate-900 dark:text-white truncate max-w-40 block text-xs">
          {log.actor_username}
        </span>
      )
    },
    {
      key: 'action',
      header: 'Action Type',
      sortable: true,
      render: (log) => (
        <span className={`text-[9px] font-heading tracking-widest px-2 py-1 rounded-md uppercase font-black ${getActionBadgeClass(log.action)}`}>
          {log.action.replace(/_/g, ' ')}
        </span>
      )
    },
    {
      key: 'details',
      header: 'Event Description',
      render: (log) => (
        <span className="text-slate-600 dark:text-slate-400 text-xs block leading-relaxed max-w-sm md:max-w-xl truncate" title={log.details}>
          {log.details || '—'}
        </span>
      )
    }
  ];

  // Helper metric tallies
  const securityEventCount = logs.filter(l => {
    const act = l.action.toUpperCase();
    return act.includes('DELETE') || act.includes('PURGE') || act.includes('CONFIG') || act.includes('UPDATE');
  }).length;

  const uniqueActors = new Set(logs.map(l => l.actor_username)).size;

  return (
    <div className="space-y-8 font-body">
      
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-heading tracking-widest uppercase text-slate-900 dark:text-slate-100">
            System Audit Logs
          </h2>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
            Real-time tracking of administrative events, check-ins, and database transactions.
          </p>
        </div>
        
        <button
          onClick={fetchLogs}
          disabled={isLoading}
          className="inline-flex items-center gap-2 px-4 py-2.5 bg-blue-600 dark:bg-[#bf0202] hover:opacity-90 disabled:opacity-50 text-white text-[10px] font-heading tracking-widest uppercase rounded-lg transition-all cursor-pointer self-start sm:self-auto shadow-md"
        >
          {isLoading ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <RefreshCw className="w-3.5 h-3.5" />
          )}
          Refresh Logs
        </button>
      </div>

      {/* KPI Info Widgets */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="p-4 bg-slate-50 dark:bg-neutral-900/50 border border-slate-200 dark:border-white/5 rounded-xl flex items-center gap-3.5">
          <div className="p-2.5 bg-blue-600/10 dark:bg-[#bf0202]/10 rounded-lg text-blue-600 dark:text-[#bf0202]">
            <FileText className="w-5 h-5" />
          </div>
          <div>
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">Total Logged Events</span>
            <span className="text-base font-extrabold text-slate-900 dark:text-white font-mono">
              {logs.length} Actions
            </span>
          </div>
        </div>

        <div className="p-4 bg-slate-50 dark:bg-neutral-900/50 border border-slate-200 dark:border-white/5 rounded-xl flex items-center gap-3.5">
          <div className="p-2.5 bg-amber-500/10 rounded-lg text-amber-500">
            <AlertTriangle className="w-5 h-5" />
          </div>
          <div>
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">Security & Config Edits</span>
            <span className="text-base font-extrabold text-slate-900 dark:text-white font-mono">
              {securityEventCount} Events
            </span>
          </div>
        </div>

        <div className="p-4 bg-slate-50 dark:bg-neutral-900/50 border border-slate-200 dark:border-white/5 rounded-xl flex items-center gap-3.5">
          <div className="p-2.5 bg-emerald-500/10 rounded-lg text-emerald-500">
            <Users className="w-5 h-5" />
          </div>
          <div>
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">Active Actors</span>
            <span className="text-base font-extrabold text-slate-900 dark:text-white font-mono">
              {uniqueActors} Operators
            </span>
          </div>
        </div>
      </div>

      {/* Main Table Interface */}
      <div className="p-1 rounded-2xl border border-slate-200 dark:border-white/5 bg-slate-50/50 dark:bg-neutral-950/20">
        <Table<any>
          data={logs}
          columns={columns}
          searchKeys={['actor_username', 'action', 'details']}
          searchPlaceholder="Search audit logs by actor, action, or details..."
          defaultSortKey="created_at"
          defaultSortDirection="desc"
          itemsPerPage={10}
          loading={isLoading}
          loadingLabel="Fetching system telemetry logs..."
        />
      </div>

      {/* Safety Policy Info Box */}
      <div className="flex items-start gap-3 p-4 bg-blue-500/5 dark:bg-blue-500/10 border border-blue-500/20 rounded-xl text-xs text-blue-700 dark:text-blue-300 leading-normal max-w-4xl">
        <ShieldCheck className="w-4 h-4 shrink-0 mt-0.5" />
        <div className="space-y-1">
          <p className="font-bold">System Retention Policy (pgAudit Aligned)</p>
          <p className="text-[11px] opacity-90">
            Audit logging operations are protected under secure write-only database constraints. Manual record updates or deletions are restricted at the database catalog layer. Logs are retained for exactly one year and pruned daily via an automated database cron job at midnight Manila time.
          </p>
        </div>
      </div>

    </div>
  );
};