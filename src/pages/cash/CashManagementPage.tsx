// src/pages/cash/CashManagementPage.tsx
import React, { useState, useEffect } from 'react';
import { format } from 'date-fns';
import {
  Wallet,
  ArrowDownRight,
  ArrowUpRight,
  Smartphone,
  ShieldCheck,
  History,
  Lock,
  Play,
  Eye,
  CheckCircle2,
  AlertTriangle,
} from 'lucide-react';
import { toast } from 'react-toastify';
import { useCashSessionStore } from '../../stores/useCashSessionStore';
import { useAuthStore } from '../../stores/authStore';
import { openCashSession } from '../../lib/supabase/cashService';
import { CashMetricsCards } from './components/CashMetricsCards';
import { CashTransactionsTable } from './components/CashTransactionsTable';
import { CashInModal } from './components/CashInModal';
import { CashOutModal } from './components/CashOutModal';
import { DigitalInModal } from './components/DigitalInModal';
import { CloseSessionModal } from './components/CloseSessionModal';
import { SessionDetailsModal } from './components/SessionDetailsModal';
import { Button } from '../../components/ui/Button';
import type { CashSession } from '../../types/cash';

const PRESET_FLOATS = [500, 1000, 2000, 3000, 5000];

export const CashManagementPage: React.FC = () => {
  const { user, profile } = useAuthStore();
  const isAdmin =
    profile?.role === 'admin' ||
    user?.email?.toLowerCase() === 'wolf.palomar@gmail.com';

  const {
    activeSession,
    transactions,
    history,
    metrics,
    isLoading,
    isSessionOpen,
    currentDrawerCash,
    loadActiveSession,
    loadHistory,
    refreshTransactions,
    subscribeRealtime,
  } = useCashSessionStore();

  // Modal states
  const [showCashIn, setShowCashIn] = useState(false);
  const [showCashOut, setShowCashOut] = useState(false);
  const [showDigitalIn, setShowDigitalIn] = useState(false);
  const [showCloseModal, setShowCloseModal] = useState(false);
  const [selectedHistorySession, setSelectedHistorySession] =
    useState<CashSession | null>(null);

  // Start Session Form State (Admin)
  const [openingFloatInput, setOpeningFloatInput] = useState('1000');
  const [openingNotes, setOpeningNotes] = useState('');
  const [isOpeningSession, setIsOpeningSession] = useState(false);

  useEffect(() => {
    const unsubscribe = subscribeRealtime();
    return () => {
      unsubscribe();
    };
  }, [subscribeRealtime]);

  const handleStartSession = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isAdmin) {
      toast.error('Only administrators can open cash sessions.');
      return;
    }

    const floatVal = parseFloat(openingFloatInput);
    if (isNaN(floatVal) || floatVal < 0) {
      toast.error('Please enter a valid opening float amount (0 or greater).');
      return;
    }

    try {
      setIsOpeningSession(true);
      const actorName =
        profile?.username || user?.user_metadata?.full_name || user?.email || 'Admin';

      await openCashSession({
        openingFloat: floatVal,
        notes: openingNotes.trim() || undefined,
        openedBy: user?.id || null,
        openedByName: actorName,
      });

      toast.success(
        `Cash drawer session opened with starting float ₱${floatVal.toFixed(2)}.`
      );
      setOpeningNotes('');
      await loadActiveSession();
      await loadHistory();
    } catch (err: any) {
      toast.error(err?.message || 'Failed to open cash session.');
    } finally {
      setIsOpeningSession(false);
    }
  };

  return (
    <div className="space-y-6 pb-12 font-body text-slate-900 dark:text-white">
      {/* Top Banner & Status Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 sm:p-5 rounded-2xl bg-white dark:bg-[#16181a] border border-slate-200 dark:border-white/10 shadow-sm">
        <div className="flex items-center gap-3">
          <div
            className={`w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 ${
              isSessionOpen
                ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400'
                : 'bg-rose-500/15 text-rose-600 dark:text-rose-400'
            }`}
          >
            <Wallet className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-lg sm:text-xl font-heading font-black tracking-tight text-slate-900 dark:text-white">
                LIVE CASH MANAGEMENT
              </h2>
              <span
                className={`text-[10px] font-black uppercase tracking-wider px-2.5 py-0.5 rounded-full flex items-center gap-1.5 ${
                  isSessionOpen
                    ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20'
                    : 'bg-rose-500/15 text-rose-600 dark:text-rose-400 border border-rose-500/20'
                }`}
              >
                <span
                  className={`w-1.5 h-1.5 rounded-full ${
                    isSessionOpen ? 'bg-emerald-500 animate-pulse' : 'bg-rose-500'
                  }`}
                />
                {isSessionOpen ? 'DRAWER OPEN' : 'SESSION CLOSED'}
              </span>
            </div>
            {isSessionOpen && activeSession ? (
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Session <span className="font-mono font-bold text-slate-800 dark:text-slate-200">{activeSession.session_number}</span> • Opened by {activeSession.opened_by_name} at{' '}
                {format(new Date(activeSession.opened_at), 'h:mm a')}
              </p>
            ) : (
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                No cash session currently active. Money transactions require an open session.
              </p>
            )}
          </div>
        </div>

        {/* Action Buttons Bar */}
        {isSessionOpen && (
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => setShowCashIn(true)}
              className="flex-1 sm:flex-none px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold flex items-center justify-center gap-1.5 transition-all shadow-sm"
            >
              <ArrowDownRight className="w-4 h-4" />
              Cash In
            </button>
            <button
              onClick={() => setShowCashOut(true)}
              className="flex-1 sm:flex-none px-3.5 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold flex items-center justify-center gap-1.5 transition-all shadow-sm"
            >
              <ArrowUpRight className="w-4 h-4" />
              Cash Out
            </button>
            <button
              onClick={() => setShowDigitalIn(true)}
              className="flex-1 sm:flex-none px-3.5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold flex items-center justify-center gap-1.5 transition-all shadow-sm"
            >
              <Smartphone className="w-4 h-4" />
              Digital In
            </button>
            {isAdmin && (
              <button
                onClick={() => setShowCloseModal(true)}
                className="flex-1 sm:flex-none px-3.5 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 dark:bg-white dark:hover:bg-slate-100 text-white dark:text-slate-900 text-xs font-bold flex items-center justify-center gap-1.5 transition-all shadow-sm"
              >
                <ShieldCheck className="w-4 h-4 text-emerald-500" />
                Close Session
              </button>
            )}
          </div>
        )}
      </div>

      {/* Main Content Area */}
      {isSessionOpen ? (
        <div className="space-y-6">
          {/* Top Metrics Cards */}
          <CashMetricsCards metrics={metrics} />

          {/* Activity Ledger Table */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-heading font-black uppercase tracking-wider text-slate-900 dark:text-white">
                  SESSION ACTIVITY LEDGER
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Real-time log of physical cash inflows, outflows, and digital collections.
                </p>
              </div>
            </div>
            <CashTransactionsTable
              transactions={transactions}
              isLoading={isLoading}
            />
          </div>
        </div>
      ) : (
        /* Closed Session State */
        <div className="bg-white dark:bg-[#16181a] border border-slate-200 dark:border-white/10 rounded-2xl p-6 sm:p-8">
          {isAdmin ? (
            /* Admin Start Session Form */
            <div className="max-w-xl mx-auto text-center space-y-6">
              <div className="w-16 h-16 rounded-3xl bg-[#1b365d]/10 dark:bg-[#bf0202]/15 text-[#1b365d] dark:text-[#bf0202] flex items-center justify-center mx-auto">
                <Wallet className="w-8 h-8" />
              </div>

              <div>
                <h3 className="text-xl font-heading font-black text-slate-900 dark:text-white">
                  START NEW CASH SESSION
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 max-w-md mx-auto">
                  Start today's cash session by setting the physical opening float in the cash drawer.
                  Staff will be able to process sales, attendance, and cash movements.
                </p>
              </div>

              <form onSubmit={handleStartSession} className="space-y-5 text-left">
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300 mb-2">
                    Opening Float Amount (₱) *
                  </label>
                  <div className="relative">
                    <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 font-bold text-lg">
                      ₱
                    </span>
                    <input
                      type="number"
                      min="0"
                      step="1"
                      required
                      value={openingFloatInput}
                      onChange={(e) => setOpeningFloatInput(e.target.value)}
                      className="w-full pl-10 pr-4 py-3.5 bg-slate-50 dark:bg-neutral-900 border border-slate-200 dark:border-white/10 rounded-2xl text-xl font-heading font-black text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>

                  {/* Preset Float Pills */}
                  <div className="flex flex-wrap gap-2 mt-2.5">
                    {PRESET_FLOATS.map((preset) => (
                      <button
                        type="button"
                        key={preset}
                        onClick={() => setOpeningFloatInput(preset.toString())}
                        className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                          openingFloatInput === preset.toString()
                            ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900'
                            : 'bg-slate-100 dark:bg-neutral-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-neutral-700'
                        }`}
                      >
                        ₱{preset.toLocaleString()}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300 mb-2">
                    Session Notes (Optional)
                  </label>
                  <textarea
                    rows={2}
                    placeholder="e.g. Morning shift opener, change fund replenished..."
                    value={openingNotes}
                    onChange={(e) => setOpeningNotes(e.target.value)}
                    className="w-full px-4 py-3 bg-slate-50 dark:bg-neutral-900 border border-slate-200 dark:border-white/10 rounded-2xl text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                  />
                </div>

                <Button
                  type="submit"
                  variant="primary"
                  loading={isOpeningSession}
                  className="w-full py-4 text-sm font-heading font-black tracking-wider"
                >
                  <Play className="w-4 h-4 mr-1.5" />
                  OPEN TODAY'S CASH SESSION
                </Button>
              </form>
            </div>
          ) : (
            /* Staff Awaiting Session State */
            <div className="max-w-md mx-auto text-center py-8 space-y-4">
              <div className="w-14 h-14 rounded-2xl bg-amber-500/10 text-amber-600 dark:text-amber-400 flex items-center justify-center mx-auto">
                <Lock className="w-7 h-7" />
              </div>
              <h3 className="text-base font-heading font-black text-slate-900 dark:text-white">
                CASH SESSION IS CURRENTLY CLOSED
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                An administrator must open today's cash drawer session with an initial opening float
                before cash payments or manual movements can be accepted.
              </p>
            </div>
          )}
        </div>
      )}

      {/* Historical Sessions Section */}
      <div className="space-y-3 pt-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <History className="w-4 h-4 text-slate-500" />
            <h3 className="text-sm font-heading font-black uppercase tracking-wider text-slate-900 dark:text-white">
              CASH SESSIONS HISTORY
            </h3>
          </div>
          <span className="text-xs text-slate-400 font-mono">
            {history.length} recorded
          </span>
        </div>

        <div className="bg-white dark:bg-[#16181a] border border-slate-200 dark:border-white/10 rounded-2xl overflow-hidden shadow-sm">
          {history.length === 0 ? (
            <div className="p-8 text-center text-xs text-slate-400">
              No historical closed cash sessions found yet.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 dark:bg-neutral-900/60 text-slate-500 dark:text-slate-400 uppercase font-black tracking-wider text-[10px] border-b border-slate-200 dark:border-white/5">
                  <tr>
                    <th className="py-3 px-4">Session #</th>
                    <th className="py-3 px-4">Date Closed</th>
                    <th className="py-3 px-4">Opened By</th>
                    <th className="py-3 px-4">Closed By</th>
                    <th className="py-3 px-4 text-right">Opening Float</th>
                    <th className="py-3 px-4 text-right">Actual Counted</th>
                    <th className="py-3 px-4 text-center">Discrepancy</th>
                    <th className="py-3 px-4 text-center">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-white/5">
                  {history.map((s) => {
                    const disc = Number(s.discrepancy || 0);
                    return (
                      <tr
                        key={s.id}
                        className="hover:bg-slate-50/50 dark:hover:bg-white/[0.02]"
                      >
                        <td className="py-3 px-4 font-mono font-bold text-slate-800 dark:text-slate-200">
                          {s.session_number}
                        </td>
                        <td className="py-3 px-4 text-slate-500 dark:text-slate-400">
                          {s.closed_at
                            ? format(new Date(s.closed_at), 'MMM d, yyyy h:mm a')
                            : 'In progress'}
                        </td>
                        <td className="py-3 px-4 text-slate-600 dark:text-slate-400">
                          {s.opened_by_name}
                        </td>
                        <td className="py-3 px-4 text-slate-600 dark:text-slate-400">
                          {s.closed_by_name || '-'}
                        </td>
                        <td className="py-3 px-4 text-right font-mono text-slate-700 dark:text-slate-300">
                          ₱{Number(s.opening_float).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                        </td>
                        <td className="py-3 px-4 text-right font-mono font-bold text-slate-900 dark:text-white">
                          ₱{Number(s.closing_actual_cash || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                        </td>
                        <td className="py-3 px-4 text-center">
                          <span
                            className={`inline-flex items-center gap-1 text-[10px] font-black uppercase px-2 py-0.5 rounded-full ${
                              disc === 0
                                ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400'
                                : disc > 0
                                  ? 'bg-amber-500/15 text-amber-600 dark:text-amber-400'
                                  : 'bg-rose-500/15 text-rose-600 dark:text-rose-400'
                            }`}
                          >
                            {disc === 0 && <CheckCircle2 className="w-3 h-3" />}
                            {disc !== 0 && <AlertTriangle className="w-3 h-3" />}
                            {disc === 0
                              ? 'BALANCED'
                              : disc > 0
                                ? `+₱${disc.toFixed(2)}`
                                : `-₱${Math.abs(disc).toFixed(2)}`}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-center">
                          <button
                            onClick={() => setSelectedHistorySession(s)}
                            className="px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-neutral-800 dark:hover:bg-neutral-700 text-slate-700 dark:text-slate-300 text-xs font-bold inline-flex items-center gap-1 transition-colors"
                          >
                            <Eye className="w-3.5 h-3.5" />
                            Details
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Modals */}
      {isSessionOpen && activeSession && (
        <>
          <CashInModal
            isOpen={showCashIn}
            onClose={() => setShowCashIn(false)}
            sessionId={activeSession.id}
            onSuccess={refreshTransactions}
          />
          <CashOutModal
            isOpen={showCashOut}
            onClose={() => setShowCashOut(false)}
            sessionId={activeSession.id}
            currentDrawerCash={currentDrawerCash}
            onSuccess={refreshTransactions}
          />
          <DigitalInModal
            isOpen={showDigitalIn}
            onClose={() => setShowDigitalIn(false)}
            sessionId={activeSession.id}
            onSuccess={refreshTransactions}
          />
          <CloseSessionModal
            isOpen={showCloseModal}
            onClose={() => setShowCloseModal(false)}
            session={activeSession}
            metrics={metrics}
            onSuccess={async () => {
              await loadActiveSession();
              await loadHistory();
            }}
          />
        </>
      )}

      {selectedHistorySession && (
        <SessionDetailsModal
          isOpen={Boolean(selectedHistorySession)}
          onClose={() => setSelectedHistorySession(null)}
          session={selectedHistorySession}
        />
      )}
    </div>
  );
};
