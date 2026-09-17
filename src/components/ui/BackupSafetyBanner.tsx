// src/components/ui/BackupSafetyBanner.tsx
import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import {
  AlertTriangle,
  ArrowLeftRight,
  ShieldCheck,
  Undo2,
  Loader2,
  ShoppingBag,
  ClipboardList,
  Users,
  Settings,
  Eye,
  X,
} from 'lucide-react';
import { Modal } from './Modal';
import { useBackupSafetyStore } from '../../stores/useBackupSafetyStore';

export const BackupSafetyBanner: React.FC = () => {
  const navigate = useNavigate();
  const {
    safetyBackup,
    isVerifying,
    verifyAction,
    isModalOpen,
    openModal,
    closeModal,
    fetchSafetyBackup,
    subscribeRealtime,
    revertRestoration,
    commitRestoration,
  } = useBackupSafetyStore();

  useEffect(() => {
    fetchSafetyBackup();
    const unsub = subscribeRealtime();
    return () => unsub();
  }, [fetchSafetyBackup, subscribeRealtime]);

  if (!safetyBackup) return null;

  return (
    <>
      {/* ─── FULL-SCREEN BLOCKER ONLY WHILE EXECUTING REVERT OR COMMIT ─── */}
      {isVerifying &&
        createPortal(
          <div className="fixed inset-0 z-[99999] bg-slate-950/80 backdrop-blur-md flex flex-col items-center justify-center p-6 text-center select-none cursor-wait">
            <div className="p-6 bg-white dark:bg-[#161922] border border-slate-200 dark:border-zinc-800 rounded-2xl shadow-2xl max-w-sm w-full flex flex-col items-center gap-4 animate-in fade-in zoom-in-95 duration-200">
              <div className="p-3.5 bg-amber-500/10 text-amber-600 dark:text-amber-400 rounded-2xl border border-amber-500/20">
                <Loader2 className="w-8 h-8 animate-spin" />
              </div>
              <div className="space-y-1.5">
                <h3 className="font-heading font-black text-sm uppercase tracking-wider text-slate-900 dark:text-white">
                  {verifyAction === 'reverting'
                    ? 'Reverting System State...'
                    : 'Finalizing Changes...'}
                </h3>
                <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed font-medium">
                  Please wait while the database state is updated. Do not close,
                  refresh, or navigate away from this tab.
                </p>
              </div>
            </div>
          </div>,
          document.body
        )}

      {/* ─── TOP PERSISTENT YELLOW STRIPE BANNER ─── */}
      <div
        onClick={openModal}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => e.key === 'Enter' && openModal()}
        className="w-full bg-amber-500 hover:bg-amber-400 text-slate-950 px-3.5 sm:px-6 py-2.5 flex items-center justify-between gap-3 shadow-md cursor-pointer transition-colors z-50 select-none text-left shrink-0 border-b border-amber-600/30"
      >
        <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
          <div className="p-1 bg-black/10 rounded-lg shrink-0">
            <AlertTriangle className="w-4 h-4 text-slate-950 animate-bounce" />
          </div>
          <div className="text-xs sm:text-sm font-semibold truncate">
            <strong className="font-heading font-black uppercase tracking-wide mr-1.5">
              Review Restored Backup:
            </strong>
            <span className="opacity-90">
              Showing restored records. You can freely browse all pages.
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <span className="hidden md:inline-block text-[11px] font-heading font-black uppercase px-2.5 py-1 bg-black/10 rounded-md tracking-wider">
            Confirm or Revert
          </span>
          <ArrowLeftRight className="w-4 h-4 shrink-0" />
        </div>
      </div>

      {/* ─── REVIEW MODAL WITH DIRECT NAVIGATION TO ALL SECTIONS ─── */}
      <Modal
        isOpen={isModalOpen}
        onClose={closeModal}
        title="Review Backup Restoration"
      >
        <div className="space-y-4 font-body text-left">
          {/* Status Alert Banner */}
          <div className="p-3.5 sm:p-4 bg-amber-500/10 border border-amber-500/30 rounded-2xl flex items-start gap-3">
            <Eye className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
            <div className="space-y-1 text-xs">
              <span className="block font-heading font-black uppercase tracking-wider text-amber-700 dark:text-amber-400 text-[11px]">
                Inspection Mode
              </span>
              <p className="text-slate-700 dark:text-slate-300 font-medium leading-relaxed">
                The database is displaying data from your backup. You can freely
                browse all pages to review your records before deciding to
                finalize or rollback.
              </p>
            </div>
          </div>

          {/* Quick Inspection Direct Shortcuts (Includes Settings / Backups) */}
          <div className="space-y-2 pt-1">
            <span className="text-[10px] font-heading uppercase tracking-widest text-slate-500 dark:text-slate-400 font-bold block">
              Quickly Browse Records:
            </span>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <button
                type="button"
                onClick={() => {
                  navigate('/sales');
                  closeModal();
                }}
                className="p-2.5 rounded-xl border border-slate-200 dark:border-zinc-800 bg-slate-50 dark:bg-zinc-900 hover:border-blue-500/50 hover:bg-blue-500/10 transition-all flex flex-col items-center gap-1.5 cursor-pointer group"
              >
                <div className="p-1.5 rounded-lg bg-blue-500/10 text-blue-600 dark:text-blue-400 group-hover:scale-110 transition-transform">
                  <ShoppingBag className="w-4 h-4" />
                </div>
                <span className="text-[10px] font-heading font-black uppercase text-slate-700 dark:text-slate-200">
                  Sales
                </span>
              </button>

              <button
                type="button"
                onClick={() => {
                  navigate('/logbook');
                  closeModal();
                }}
                className="p-2.5 rounded-xl border border-slate-200 dark:border-zinc-800 bg-slate-50 dark:bg-zinc-900 hover:border-emerald-500/50 hover:bg-emerald-500/10 transition-all flex flex-col items-center gap-1.5 cursor-pointer group"
              >
                <div className="p-1.5 rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 group-hover:scale-110 transition-transform">
                  <ClipboardList className="w-4 h-4" />
                </div>
                <span className="text-[10px] font-heading font-black uppercase text-slate-700 dark:text-slate-200">
                  Logbook
                </span>
              </button>

              <button
                type="button"
                onClick={() => {
                  navigate('/members/list');
                  closeModal();
                }}
                className="p-2.5 rounded-xl border border-slate-200 dark:border-zinc-800 bg-slate-50 dark:bg-zinc-900 hover:border-amber-500/50 hover:bg-amber-500/10 transition-all flex flex-col items-center gap-1.5 cursor-pointer group"
              >
                <div className="p-1.5 rounded-lg bg-amber-500/10 text-amber-600 dark:text-amber-400 group-hover:scale-110 transition-transform">
                  <Users className="w-4 h-4" />
                </div>
                <span className="text-[10px] font-heading font-black uppercase text-slate-700 dark:text-slate-200">
                  Members
                </span>
              </button>

              <button
                type="button"
                onClick={() => {
                  navigate('/settings');
                  closeModal();
                }}
                className="p-2.5 rounded-xl border border-slate-200 dark:border-zinc-800 bg-slate-50 dark:bg-zinc-900 hover:border-purple-500/50 hover:bg-purple-500/10 transition-all flex flex-col items-center gap-1.5 cursor-pointer group"
              >
                <div className="p-1.5 rounded-lg bg-purple-500/10 text-purple-600 dark:text-purple-400 group-hover:scale-110 transition-transform">
                  <Settings className="w-4 h-4" />
                </div>
                <span className="text-[10px] font-heading font-black uppercase text-slate-700 dark:text-slate-200">
                  Settings
                </span>
              </button>
            </div>
          </div>

          {/* Checkpoint Meta Card */}
          <div className="p-3 rounded-xl bg-slate-100 dark:bg-zinc-800/60 border border-slate-200 dark:border-zinc-700/60 space-y-0.5 text-xs">
            <span className="text-[9px] font-heading uppercase text-slate-500 dark:text-slate-400 font-bold block">
              Safety Snapshot (Pre-Restore Point)
            </span>
            <span className="font-mono font-bold text-slate-900 dark:text-white block text-xs truncate">
              {safetyBackup.filename}
            </span>
            <span className="text-[10px] text-slate-500 dark:text-slate-400 block font-medium">
              Generated: {new Date(safetyBackup.created_at).toLocaleString()}
            </span>
          </div>

          {/* ─── ACTION BUTTONS ─── */}
          <div className="space-y-2 pt-2 border-t border-slate-200 dark:border-zinc-800">
            <div className="flex flex-col sm:flex-row items-center gap-2.5">
              <button
                type="button"
                disabled={isVerifying}
                onClick={revertRestoration}
                className="w-full sm:flex-1 py-2.5 px-3.5 rounded-xl border border-red-500/30 bg-red-500/10 hover:bg-red-600 hover:text-white text-red-600 dark:text-red-400 text-xs font-heading font-bold uppercase tracking-wider transition-all cursor-pointer flex items-center justify-center gap-2 disabled:opacity-50"
              >
                <Undo2 className="w-4 h-4 shrink-0" />
                <span>Revert Changes</span>
              </button>

              <button
                type="button"
                disabled={isVerifying}
                onClick={commitRestoration}
                className="w-full sm:flex-1 py-2.5 px-3.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-heading font-bold uppercase tracking-wider shadow-md hover:shadow-lg transition-all cursor-pointer flex items-center justify-center gap-2 disabled:opacity-50"
              >
                <ShieldCheck className="w-4 h-4 shrink-0" />
                <span>Confirm Changes</span>
              </button>
            </div>

            <button
              type="button"
              disabled={isVerifying}
              onClick={closeModal}
              className="w-full py-2.5 px-4 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-zinc-800/80 dark:hover:bg-zinc-800 text-slate-700 dark:text-slate-300 text-xs font-heading font-semibold uppercase tracking-wider transition-colors cursor-pointer flex items-center justify-center gap-1.5"
            >
              <X className="w-3.5 h-3.5 opacity-60" />
              <span>Dismiss & Browse Records</span>
            </button>
          </div>
        </div>
      </Modal>
    </>
  );
};

export default BackupSafetyBanner;
