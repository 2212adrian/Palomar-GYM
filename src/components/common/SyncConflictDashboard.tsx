// src/components/common/SyncConflictDashboard.tsx
import React, { useState } from 'react';
import {
  AlertTriangle,
  RefreshCw,
  Trash2,
  Edit3,
  CheckCircle,
  X,
  FileText,
  DollarSign,
  UserCheck,
  Package,
  CreditCard,
  Layers,
  ArrowRight,
} from 'lucide-react';
import { toast } from 'react-toastify';
import { Modal } from '../ui/Modal';
import {
  useOfflineSyncStore,
  type SyncConflictItem,
} from '../../stores/useOfflineSyncStore';

interface SyncConflictDashboardProps {
  isOpen: boolean;
  onClose: () => void;
}

export const SyncConflictDashboard: React.FC<SyncConflictDashboardProps> = ({
  isOpen,
  onClose,
}) => {
  const { conflicts, resolveConflict, dismissConflict } = useOfflineSyncStore();
  const [filterType, setFilterType] = useState<string>('all');
  const [resolvingId, setResolvingId] = useState<string | null>(null);

  // Edit Payload Modal State
  const [editingConflict, setEditingConflict] = useState<SyncConflictItem | null>(null);
  const [editPayloadJson, setEditPayloadJson] = useState<string>('');
  const [editJsonError, setEditJsonError] = useState<string | null>(null);

  const filteredConflicts = conflicts.filter((c) => {
    if (filterType === 'all') return true;
    if (filterType === 'sales') return c.action.startsWith('sale_');
    if (filterType === 'attendance') return c.action.startsWith('attendance_');
    if (filterType === 'products') return c.action.startsWith('product_');
    if (filterType === 'memberships')
      return c.action.startsWith('subscription_') || c.action.startsWith('card_');
    if (filterType === 'cash') return c.action.startsWith('cash_');
    return true;
  });

  const getActionIcon = (action: string) => {
    if (action.startsWith('sale_'))
      return <DollarSign className="w-4 h-4 text-emerald-500" />;
    if (action.startsWith('attendance_'))
      return <UserCheck className="w-4 h-4 text-blue-500" />;
    if (action.startsWith('product_'))
      return <Package className="w-4 h-4 text-purple-500" />;
    if (action.startsWith('subscription_') || action.startsWith('card_'))
      return <CreditCard className="w-4 h-4 text-amber-500" />;
    if (action.startsWith('cash_'))
      return <Layers className="w-4 h-4 text-teal-500" />;
    return <FileText className="w-4 h-4 text-slate-500" />;
  };

  const getActionLabel = (action: string) => {
    const map: Record<string, string> = {
      sale_create: 'Offline Sale',
      sale_delete: 'Sale Deletion',
      attendance_checkin: 'Member Check-In',
      attendance_payment_status: 'Check-In Payment Update',
      attendance_delete: 'Check-In Deletion',
      product_create: 'Product Creation',
      product_update: 'Product Update',
      product_delete: 'Product Deletion',
      subscription_create: 'Membership Plan',
      card_issue: 'Card Issuance',
      cash_session_open: 'Cash Drawer Open',
      cash_transaction_record: 'Cash Movement',
      cash_session_close: 'Cash Drawer Close',
    };
    return map[action] || action.replace(/_/g, ' ').toUpperCase();
  };

  const handleForceSync = async (conflict: SyncConflictItem) => {
    setResolvingId(conflict.id);
    try {
      const ok = await resolveConflict(conflict.id, 'force_sync');
      if (ok) {
        toast.success(`Conflict for "${conflict.label}" queued for force sync.`);
      } else {
        toast.error('Could not force sync. Please review payload.');
      }
    } catch (err: any) {
      toast.error(err?.message || 'Force sync failed.');
    } finally {
      setResolvingId(null);
    }
  };

  const handleDiscard = async (conflict: SyncConflictItem) => {
    const confirmDiscard = window.confirm(
      `Are you sure you want to discard this offline record? It will be removed without uploading to Supabase:\n\n${conflict.label}`
    );
    if (!confirmDiscard) return;

    setResolvingId(conflict.id);
    try {
      await resolveConflict(conflict.id, 'discard');
      toast.info(`Discarded offline record "${conflict.label}".`);
    } finally {
      setResolvingId(null);
    }
  };

  const handleOpenEdit = (conflict: SyncConflictItem) => {
    setEditingConflict(conflict);
    setEditPayloadJson(JSON.stringify(conflict.payload, null, 2));
    setEditJsonError(null);
  };

  const handleSaveEditAndSync = async () => {
    if (!editingConflict) return;
    try {
      const parsed = JSON.parse(editPayloadJson);
      setResolvingId(editingConflict.id);
      const ok = await resolveConflict(editingConflict.id, 'force_sync', parsed);
      if (ok) {
        toast.success(`Updated and re-queued "${editingConflict.label}"!`);
        setEditingConflict(null);
      } else {
        toast.error('Failed to re-queue reconciled transaction.');
      }
    } catch (err: any) {
      setEditJsonError(err.message || 'Invalid JSON format');
    } finally {
      setResolvingId(null);
    }
  };

  return (
    <>
      <Modal
        isOpen={isOpen}
        onClose={onClose}
        title="SYNC CONFLICT RECONCILIATION DASHBOARD"
        className="w-full max-w-3xl mx-auto my-auto p-4 sm:p-6 overflow-hidden flex flex-col max-h-[90vh] text-left"
      >
        {/* Banner Summary */}
        <div className="flex items-start gap-3 p-3.5 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-amber-900 dark:text-amber-200 mb-4 shrink-0">
          <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
          <div className="text-xs leading-relaxed">
            <p className="font-bold text-slate-900 dark:text-white uppercase tracking-wider text-[11px]">
              Offline Data Conflicts Detected ({conflicts.length})
            </p>
            <p className="text-slate-600 dark:text-slate-300 text-[11px] mt-0.5">
              These offline transactions encountered verification or constraint mismatches while uploading to Supabase.
              Review each item and select <span className="font-semibold text-emerald-600 dark:text-emerald-400">Force Sync</span>,{' '}
              <span className="font-semibold text-blue-600 dark:text-blue-400">Edit Payload</span>, or{' '}
              <span className="font-semibold text-rose-600 dark:text-rose-400">Discard</span>.
            </p>
          </div>
        </div>

        {/* Filters */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-2 shrink-0 border-b border-slate-100 dark:border-white/10 mb-3 text-xs">
          {[
            { id: 'all', label: 'All Conflicts' },
            { id: 'sales', label: 'Sales' },
            { id: 'attendance', label: 'Attendance' },
            { id: 'memberships', label: 'Memberships & Cards' },
            { id: 'products', label: 'Products' },
            { id: 'cash', label: 'Cash Drawer' },
          ].map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setFilterType(tab.id)}
              className={`px-3 py-1.5 rounded-xl font-heading text-[10px] uppercase font-bold tracking-wider transition-all whitespace-nowrap cursor-pointer ${
                filterType === tab.id
                  ? 'bg-[#123c73] dark:bg-[#bf0202] text-white shadow-xs'
                  : 'bg-slate-100 dark:bg-zinc-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-zinc-700'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Conflicts List */}
        <div className="flex-1 overflow-y-auto space-y-3 pr-1 min-h-[220px]">
          {filteredConflicts.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center space-y-2">
              <div className="w-12 h-12 rounded-full bg-emerald-500/10 text-emerald-500 flex items-center justify-center">
                <CheckCircle className="w-6 h-6" />
              </div>
              <p className="text-sm font-bold text-slate-800 dark:text-white uppercase tracking-wider">
                No Conflicts Found
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400 max-w-sm">
                All offline transactions have either been reconciled or synchronized cleanly with Supabase.
              </p>
            </div>
          ) : (
            filteredConflicts.map((c) => (
              <div
                key={c.id}
                className="p-3.5 sm:p-4 rounded-2xl bg-white dark:bg-zinc-900 border border-slate-200 dark:border-white/10 shadow-xs space-y-2.5 transition-all"
              >
                {/* Header row */}
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <div className="w-7 h-7 rounded-lg bg-slate-100 dark:bg-zinc-800 flex items-center justify-center shrink-0">
                      {getActionIcon(c.action)}
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-heading font-black text-xs text-slate-900 dark:text-white uppercase tracking-tight truncate">
                          {c.label}
                        </span>
                        <span className="px-2 py-0.5 rounded-full bg-slate-100 dark:bg-zinc-800 text-slate-600 dark:text-slate-400 font-mono text-[9px] font-bold uppercase shrink-0">
                          {getActionLabel(c.action)}
                        </span>
                      </div>
                      <p className="text-[10px] text-slate-400 font-mono">
                        Created: {new Date(c.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })} • Detected:{' '}
                        {new Date(c.conflictDetectedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                      </p>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => dismissConflict(c.id)}
                    className="p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-zinc-800 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
                    title="Dismiss Notification"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                {/* Conflict Reason Callout */}
                <div className="p-2.5 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-700 dark:text-rose-300 text-[11px] font-medium flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 text-rose-500 shrink-0 mt-0.5" />
                  <div className="space-y-0.5">
                    <p className="font-bold text-[10px] uppercase tracking-wider text-rose-600 dark:text-rose-400">
                      Conflict Reason
                    </p>
                    <p className="leading-snug">{c.conflictReason}</p>
                  </div>
                </div>

                {/* Payload Preview */}
                <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-zinc-800/50 border border-slate-200/60 dark:border-white/5 font-mono text-[10px] text-slate-600 dark:text-slate-400 overflow-x-auto max-h-24">
                  <pre>{JSON.stringify(c.payload, null, 2)}</pre>
                </div>

                {/* Action Buttons */}
                <div className="flex items-center justify-end gap-2 pt-1 border-t border-slate-100 dark:border-white/5">
                  <button
                    type="button"
                    onClick={() => handleDiscard(c)}
                    disabled={resolvingId === c.id}
                    className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl border border-rose-500/30 text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/30 text-[10px] font-bold uppercase tracking-wider cursor-pointer disabled:opacity-50 transition-colors"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    Discard Record
                  </button>

                  <button
                    type="button"
                    onClick={() => handleOpenEdit(c)}
                    disabled={resolvingId === c.id}
                    className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl border border-blue-500/30 text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-950/30 text-[10px] font-bold uppercase tracking-wider cursor-pointer disabled:opacity-50 transition-colors"
                  >
                    <Edit3 className="w-3.5 h-3.5" />
                    Edit Payload
                  </button>

                  <button
                    type="button"
                    onClick={() => handleForceSync(c)}
                    disabled={resolvingId === c.id}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-[10px] font-bold uppercase tracking-wider cursor-pointer disabled:opacity-50 transition-colors shadow-xs"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${resolvingId === c.id ? 'animate-spin' : ''}`} />
                    Force Sync
                  </button>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between pt-3 border-t border-slate-100 dark:border-white/10 shrink-0 text-xs">
          <span className="text-[11px] text-slate-500 dark:text-slate-400 font-mono">
            {conflicts.length} conflict(s) pending reconciliation
          </span>
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1.5 rounded-xl border border-slate-200 dark:border-zinc-700 bg-slate-100 hover:bg-slate-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-slate-700 dark:text-slate-200 font-heading text-[10px] uppercase font-bold tracking-wider cursor-pointer transition-colors"
          >
            Close Dashboard
          </button>
        </div>
      </Modal>

      {/* Inline Edit Payload Modal */}
      {editingConflict && (
        <Modal
          isOpen={Boolean(editingConflict)}
          onClose={() => setEditingConflict(null)}
          title={`RECONCILE PAYLOAD: ${editingConflict.label}`}
          className="w-full max-w-lg mx-auto my-auto p-4 sm:p-6 text-left"
        >
          <div className="space-y-3">
            <p className="text-xs text-slate-600 dark:text-slate-300">
              Edit the JSON fields below (e.g. adjust conflicting reference number or amounts), then click Save &amp; Re-queue to push.
            </p>

            {editJsonError && (
              <p className="text-[11px] text-rose-500 font-bold p-2 bg-rose-500/10 rounded-lg">
                ⚠️ {editJsonError}
              </p>
            )}

            <textarea
              rows={10}
              value={editPayloadJson}
              onChange={(e) => {
                setEditPayloadJson(e.target.value);
                setEditJsonError(null);
              }}
              className="w-full p-3 font-mono text-xs rounded-xl border border-slate-200 dark:border-zinc-700 bg-slate-50 dark:bg-zinc-900 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setEditingConflict(null)}
                className="px-3 py-2 rounded-xl border border-slate-200 dark:border-zinc-700 bg-slate-100 hover:bg-slate-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-slate-700 dark:text-slate-200 font-heading text-xs uppercase font-bold tracking-wider cursor-pointer transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSaveEditAndSync}
                disabled={Boolean(resolvingId)}
                className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-heading text-xs uppercase font-bold tracking-wider cursor-pointer disabled:opacity-50 transition-colors shadow-xs"
              >
                Save &amp; Force Sync
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </Modal>
      )}
    </>
  );
};
