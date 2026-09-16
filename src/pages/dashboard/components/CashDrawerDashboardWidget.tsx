// src/pages/dashboard/components/CashDrawerDashboardWidget.tsx
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { format } from 'date-fns';
import {
  Wallet,
  ArrowDownRight,
  ArrowUpRight,
  Smartphone,
  ExternalLink,
  ShieldAlert,
  Coins,
  Play,
  Banknote,
} from 'lucide-react';
import { useCashSessionStore } from '../../../stores/useCashSessionStore';
import { useAuthStore } from '../../../stores/authStore';
import { CashTransactionModal } from '../../cash/components/CashTransactionModal';
import type { CashTransactionType } from '../../../types/cash';

export const CashDrawerDashboardWidget: React.FC = () => {
  const navigate = useNavigate();
  const { user, profile } = useAuthStore();
  const isAdmin =
    profile?.role === 'admin' ||
    user?.email?.toLowerCase() === 'wolf.palomar@gmail.com';

  const {
    activeSession,
    isSessionOpen,
    currentDrawerCash,
    metrics,
    refreshTransactions,
  } = useCashSessionStore();

  const [txModalType, setTxModalType] = useState<CashTransactionType | null>(
    null
  );

  const safeDrawerCash = currentDrawerCash ?? metrics.expectedDrawerCash ?? 0;
  const totalCashInflow = metrics.cashSales + metrics.cashLogbook;
  const netManualMovement = metrics.cashInTotal - metrics.cashOutTotal;

  return (
    <>
      <div className="bg-white dark:bg-[#161920] border border-slate-200/80 dark:border-slate-800/80 rounded-2xl p-4 sm:p-5 shadow-xs transition-all">
        {/* Header Ribbon */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3.5 border-b border-slate-100 dark:border-slate-800">
          <div className="flex items-center gap-2.5">
            <div
              className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
                isSessionOpen
                  ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400'
                  : 'bg-rose-500/15 text-rose-600 dark:text-rose-400'
              }`}
            >
              <Wallet className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="text-xs sm:text-sm font-black uppercase font-heading text-slate-900 dark:text-white tracking-wider">
                  CASH DRAWER & SHIFT SESSION
                </h3>
                <span
                  className={`text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full flex items-center gap-1.5 ${
                    isSessionOpen
                      ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20'
                      : 'bg-rose-500/15 text-rose-600 dark:text-rose-400 border border-rose-500/20'
                  }`}
                >
                  <span
                    className={`w-1.5 h-1.5 rounded-full ${
                      isSessionOpen
                        ? 'bg-emerald-500 animate-pulse'
                        : 'bg-rose-500'
                    }`}
                  />
                  {isSessionOpen ? 'DRAWER OPEN' : 'SESSION CLOSED'}
                </span>
              </div>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 truncate">
                {isSessionOpen && activeSession ? (
                  <>
                    Session{' '}
                    <span className="font-mono font-bold text-slate-800 dark:text-slate-200">
                      {activeSession.session_number}
                    </span>{' '}
                    • Opened by {activeSession.opened_by_name} at{' '}
                    {format(new Date(activeSession.opened_at), 'h:mm a')}
                  </>
                ) : (
                  'No cash session active. Point-of-sale and logbook cash payments require an open drawer session.'
                )}
              </p>
            </div>
          </div>

          {/* Quick Action Navigation Buttons */}
          <div className="flex items-center gap-1.5 shrink-0 self-start sm:self-auto">
            {isSessionOpen && (
              <>
                <button
                  type="button"
                  onClick={() => setTxModalType('cash_in')}
                  className="px-2.5 py-1.5 rounded-lg bg-emerald-50 hover:bg-emerald-100 dark:bg-emerald-950/50 dark:hover:bg-emerald-900/60 text-emerald-700 dark:text-emerald-300 text-[11px] font-bold flex items-center gap-1 transition-all cursor-pointer active:scale-95"
                  title="Record physical cash added to register"
                >
                  <ArrowDownRight className="w-3.5 h-3.5" />
                  <span>Cash In</span>
                </button>
                <button
                  type="button"
                  onClick={() => setTxModalType('cash_out')}
                  className="px-2.5 py-1.5 rounded-lg bg-rose-50 hover:bg-rose-100 dark:bg-rose-950/50 dark:hover:bg-rose-900/60 text-rose-700 dark:text-rose-300 text-[11px] font-bold flex items-center gap-1 transition-all cursor-pointer active:scale-95"
                  title="Record petty cash or drawer withdrawal"
                >
                  <ArrowUpRight className="w-3.5 h-3.5" />
                  <span>Cash Out</span>
                </button>
              </>
            )}

            <button
              type="button"
              onClick={() => navigate('/cash-management')}
              className="px-3 py-1.5 rounded-lg bg-slate-100 dark:bg-[#1e232d] hover:bg-[#123c73] hover:text-white dark:hover:bg-[#bf0202] text-slate-700 dark:text-slate-200 text-[11px] font-bold flex items-center gap-1 transition-all cursor-pointer active:scale-95"
            >
              <span>Cash Management</span>
              <ExternalLink className="w-3 h-3" />
            </button>
          </div>
        </div>

        {/* Content Body */}
        {isSessionOpen ? (
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 pt-3.5">
            {/* 1. Hero Card: Expected Physical Drawer Cash */}
            <div className="col-span-2 sm:col-span-2 lg:col-span-1 p-3.5 rounded-xl bg-gradient-to-br from-[#123c73] to-[#0c2950] dark:from-[#bf0202] dark:to-[#8a0202] text-white flex flex-col justify-between shadow-xs">
              <div className="flex items-center justify-between">
                <span className="text-[10px] uppercase font-bold text-white/80 tracking-wider">
                  Physical Drawer Cash
                </span>
                <Wallet className="w-3.5 h-3.5 text-white/70" />
              </div>
              <div className="text-xl sm:text-2xl font-black font-heading tracking-tight mt-1 truncate">
                ₱
                {safeDrawerCash.toLocaleString('en-US', {
                  minimumFractionDigits: 2,
                })}
              </div>
              <div className="text-[10px] text-white/80 flex items-center gap-1.5 mt-1 font-semibold">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                EXPECTED IN REGISTER
              </div>
            </div>

            {/* 2. Opening Float / Change Fund */}
            <div className="p-3 rounded-xl bg-slate-50 dark:bg-[#1e232d]/40 border border-slate-200/80 dark:border-slate-800 flex flex-col justify-between">
              <div className="flex items-center justify-between">
                <span className="text-[10px] uppercase font-bold text-slate-500 dark:text-slate-400">
                  Opening Float
                </span>
                <Banknote className="w-3.5 h-3.5 text-slate-400" />
              </div>
              <div className="text-base sm:text-lg font-black font-heading text-slate-900 dark:text-white mt-1 truncate">
                ₱
                {metrics.openingFloat.toLocaleString('en-US', {
                  minimumFractionDigits: 2,
                })}
              </div>
              <span className="text-[10px] text-slate-400 mt-1 truncate">
                Starting change fund
              </span>
            </div>

            {/* 3. Physical Cash Collections */}
            <div className="p-3 rounded-xl bg-slate-50 dark:bg-[#1e232d]/40 border border-slate-200/80 dark:border-slate-800 flex flex-col justify-between">
              <div className="flex items-center justify-between">
                <span className="text-[10px] uppercase font-bold text-emerald-600 dark:text-emerald-400">
                  Cash Collections
                </span>
                <Coins className="w-3.5 h-3.5 text-emerald-500" />
              </div>
              <div className="text-base sm:text-lg font-black font-heading text-emerald-600 dark:text-emerald-400 mt-1 truncate">
                +₱
                {totalCashInflow.toLocaleString('en-US', {
                  minimumFractionDigits: 2,
                })}
              </div>
              <span className="text-[10px] text-slate-400 mt-1 truncate">
                POS Sales + Logbook Entry
              </span>
            </div>

            {/* 4. Manual Drawer Movements (Net Cash In/Out) */}
            <div className="p-3 rounded-xl bg-slate-50 dark:bg-[#1e232d]/40 border border-slate-200/80 dark:border-slate-800 flex flex-col justify-between">
              <div className="flex items-center justify-between">
                <span className="text-[10px] uppercase font-bold text-slate-500 dark:text-slate-400">
                  Manual Movements
                </span>
                <div className="flex items-center">
                  <ArrowDownRight className="w-3 h-3 text-emerald-500" />
                  <ArrowUpRight className="w-3 h-3 text-rose-500" />
                </div>
              </div>
              <div className="text-base sm:text-lg font-black font-heading text-slate-900 dark:text-white mt-1 truncate">
                {netManualMovement >= 0 ? '+' : '-'}₱
                {Math.abs(netManualMovement).toLocaleString('en-US', {
                  minimumFractionDigits: 2,
                })}
              </div>
              <span className="text-[10px] text-slate-400 mt-1 truncate font-mono">
                +₱{Math.round(metrics.cashInTotal)} / -₱
                {Math.round(metrics.cashOutTotal)}
              </span>
            </div>

            {/* 5. Non-Drawer Digital Collections */}
            <div className="p-3 rounded-xl bg-slate-50 dark:bg-[#1e232d]/40 border border-slate-200/80 dark:border-slate-800 flex flex-col justify-between">
              <div className="flex items-center justify-between">
                <span className="text-[10px] uppercase font-bold text-blue-600 dark:text-blue-400">
                  Digital Non-Drawer
                </span>
                <Smartphone className="w-3.5 h-3.5 text-blue-500" />
              </div>
              <div className="text-base sm:text-lg font-black font-heading text-blue-600 dark:text-blue-400 mt-1 truncate">
                ₱
                {metrics.totalDigitalCollections.toLocaleString('en-US', {
                  minimumFractionDigits: 2,
                })}
              </div>
              <span className="text-[10px] text-slate-400 mt-1 truncate">
                GCash / Maya E-Wallets
              </span>
            </div>
          </div>
        ) : (
          <div className="pt-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs bg-slate-50/70 dark:bg-[#1e232d]/20 p-3.5 rounded-xl border border-dashed border-slate-200 dark:border-slate-800">
            <div className="flex items-center gap-2 text-slate-600 dark:text-slate-300">
              <ShieldAlert className="w-4 h-4 text-amber-500 shrink-0" />
              <span>
                Today's cash drawer session is closed. Set an initial opening
                float to start accepting cash payments.
              </span>
            </div>

            {isAdmin ? (
              <button
                type="button"
                onClick={() => navigate('/cash-management')}
                className="px-3.5 py-2 rounded-xl bg-[#123c73] hover:bg-[#0c2950] dark:bg-[#bf0202] text-white text-xs font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer shrink-0 active:scale-95 shadow-xs"
              >
                <Play className="w-3.5 h-3.5" />
                <span>Open Cash Session</span>
              </button>
            ) : (
              <span className="text-[11px] text-slate-400 italic">
                Only administrators can initialize the cash drawer session.
              </span>
            )}
          </div>
        )}
      </div>

      {/* Cash Transaction Quick Modal */}
      {isSessionOpen && activeSession && txModalType && (
        <CashTransactionModal
          isOpen={Boolean(txModalType)}
          onClose={() => setTxModalType(null)}
          type={txModalType}
          sessionId={activeSession.id}
          currentDrawerCash={safeDrawerCash}
          onSuccess={refreshTransactions}
        />
      )}
    </>
  );
};
