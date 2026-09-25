// src/pages/cash/CashManagementPage.tsx
import React, { useState, useEffect, useMemo } from 'react';
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
  RotateCcw,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { toast } from 'react-toastify';
import { useCashSessionStore } from '../../stores/useCashSessionStore';
import { useAuthStore } from '../../stores/authStore';
import { isSuperAdmin } from '../../constants/auth';
import { openCashSession } from '../../lib/supabase/cashService';
import { CashMetricsCards } from './components/CashMetricsCards';
import { CashTransactionsTable } from './components/CashTransactionsTable';
import { CashTransactionModal } from './components/CashTransactionModal';
import {
  CloseSessionModal,
  SessionDetailsModal,
} from './components/CashSessionModals';
import { Button } from '../../components/ui/Button';
import { Table, type Column } from '../../components/ui/Table';
import type { CashSession, CashTransactionType } from '../../types/cash';

const PRESET_FLOATS = [500, 1000, 2000, 3000, 5000];
const SESSIONS_PER_PAGE = 5;

export const CashManagementPage: React.FC = () => {
  const { user, profile } = useAuthStore();
  const isAdmin = profile?.role === 'admin' || isSuperAdmin(user?.email);

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

  // Unified modal state
  const [activeTxType, setActiveTxType] = useState<CashTransactionType | null>(
    null
  );
  const [showCloseModal, setShowCloseModal] = useState(false);
  const [selectedHistorySession, setSelectedHistorySession] =
    useState<CashSession | null>(null);

  // Opening float inputs
  const [openingFloatInput, setOpeningFloatInput] = useState('1000');
  const [openingNotes, setOpeningNotes] = useState('');
  const [isOpeningSession, setIsOpeningSession] = useState(false);

  // Mobile history card pagination state
  const [mobileHistoryPage, setMobileHistoryPage] = useState(1);

  useEffect(() => {
    loadActiveSession();
    if (isAdmin) {
      loadHistory();
    }
    const unsubscribe = subscribeRealtime();
    return () => {
      unsubscribe();
    };
  }, [loadActiveSession, loadHistory, subscribeRealtime, isAdmin]);

  // Find the most recent closed session with an actual counted cash figure
  const lastClosedSession = useMemo(() => {
    if (!history || history.length === 0) return null;
    return (
      history.find(
        (s) => s.status === 'closed' && s.closing_actual_cash !== null
      ) || null
    );
  }, [history]);

  const lastCountedCash = useMemo(() => {
    if (!lastClosedSession || lastClosedSession.closing_actual_cash === null)
      return null;
    return Number(lastClosedSession.closing_actual_cash);
  }, [lastClosedSession]);

  // Auto-populate opening float with the last counted cash when available
  useEffect(() => {
    if (lastCountedCash !== null && !isSessionOpen) {
      setOpeningFloatInput(lastCountedCash.toString());
    }
  }, [lastCountedCash, isSessionOpen]);

  const handleStartSession = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isAdmin) {
      toast.error('Only administrators can open cash sessions.');
      return;
    }

    const floatVal = parseFloat(openingFloatInput);
    if (isNaN(floatVal) || floatVal < 0) {
      toast.error('Please enter a valid opening float amount.');
      return;
    }

    try {
      setIsOpeningSession(true);
      const actorName =
        profile?.username ||
        user?.user_metadata?.full_name ||
        user?.email ||
        'Admin';

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
      toast.error(err?.message || 'Failed to open cash session in Supabase.');
    } finally {
      setIsOpeningSession(false);
    }
  };

  // Table Column definitions for Cash Sessions History
  const historyColumns: Column<CashSession>[] = useMemo(
    () => [
      {
        key: 'session_number',
        header: 'Session #',
        sortable: true,
        render: (s) => (
          <span className="font-mono font-bold text-slate-900 dark:text-white">
            {s.session_number}
          </span>
        ),
      },
      {
        key: 'closed_at',
        header: 'Date Closed',
        sortable: true,
        sortValue: (s) => (s.closed_at ? new Date(s.closed_at).getTime() : 0),
        render: (s) => (
          <span className="text-slate-500 dark:text-slate-400">
            {s.closed_at
              ? format(new Date(s.closed_at), 'MMM d, yyyy h:mm a')
              : 'In progress'}
          </span>
        ),
      },
      {
        key: 'opened_by_name',
        header: 'Opened By',
        sortable: true,
        render: (s) => (
          <span className="text-slate-600 dark:text-slate-300">
            {s.opened_by_name || '-'}
          </span>
        ),
      },
      {
        key: 'closed_by_name',
        header: 'Closed By',
        sortable: true,
        render: (s) => (
          <span className="text-slate-600 dark:text-slate-300">
            {s.closed_by_name || '-'}
          </span>
        ),
      },
      {
        key: 'opening_float',
        header: 'Opening Float',
        sortable: true,
        headerClassName: 'text-right',
        cellClassName: 'text-right',
        sortValue: (s) => Number(s.opening_float || 0),
        render: (s) => (
          <span className="font-mono text-slate-700 dark:text-slate-300">
            ₱
            {Number(s.opening_float || 0).toLocaleString('en-US', {
              minimumFractionDigits: 2,
            })}
          </span>
        ),
      },
      {
        key: 'closing_actual_cash',
        header: 'Actual Counted',
        sortable: true,
        headerClassName: 'text-right',
        cellClassName: 'text-right',
        sortValue: (s) => Number(s.closing_actual_cash || 0),
        render: (s) => (
          <span className="font-mono font-bold text-slate-900 dark:text-white">
            ₱
            {Number(s.closing_actual_cash || 0).toLocaleString('en-US', {
              minimumFractionDigits: 2,
            })}
          </span>
        ),
      },
      {
        key: 'discrepancy',
        header: 'Discrepancy',
        sortable: true,
        headerClassName: 'text-center',
        cellClassName: 'text-center',
        sortValue: (s) => Number(s.discrepancy || 0),
        render: (s) => {
          const disc = Number(s.discrepancy || 0);
          return (
            <span
              className={`inline-flex items-center gap-1 text-[10px] font-black uppercase px-2.5 py-0.5 rounded-full ${
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
                  ? `+₱${disc.toFixed(2)} OVERAGE`
                  : `-₱${Math.abs(disc).toFixed(2)} SHORTAGE`}
            </span>
          );
        },
      },
      {
        key: 'actions',
        header: 'Actions',
        headerClassName: 'text-center',
        cellClassName: 'text-center',
        render: (s) => (
          <button
            onClick={() => setSelectedHistorySession(s)}
            className="px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-[#161920] dark:hover:bg-[#1e232d] border border-slate-200/80 dark:border-white/10 active:scale-95 text-slate-700 dark:text-slate-300 text-xs font-bold inline-flex items-center gap-1 transition-all cursor-pointer shadow-xs"
          >
            <Eye className="w-3.5 h-3.5" />
            Details
          </button>
        ),
      },
    ],
    []
  );

  // Pagination for mobile card view
  const totalMobilePages = Math.ceil(history.length / SESSIONS_PER_PAGE) || 1;
  const paginatedMobileHistory = useMemo(() => {
    const start = (mobileHistoryPage - 1) * SESSIONS_PER_PAGE;
    return history.slice(start, start + SESSIONS_PER_PAGE);
  }, [history, mobileHistoryPage]);

  return (
    <div className="space-y-5 sm:space-y-6 pb-16 sm:pb-12 font-body text-slate-900 dark:text-white max-w-7xl mx-auto px-1 sm:px-0">
      {/* Top Banner & Status Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 p-4 sm:p-5 rounded-2xl bg-white dark:bg-[#12151c] border border-slate-200/90 dark:border-white/10 shadow-xs">
        <div className="flex items-center gap-3">
          <div
            className={`w-11 h-11 sm:w-12 sm:h-12 rounded-2xl flex items-center justify-center shrink-0 transition-transform ${
              isSessionOpen
                ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400'
                : 'bg-rose-500/15 text-rose-600 dark:text-rose-400'
            }`}
          >
            <Wallet className="w-5 h-5 sm:w-6 sm:h-6" />
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-base sm:text-xl font-heading font-black tracking-tight text-slate-900 dark:text-white">
                LIVE CASH MANAGEMENT
              </h2>
              <span
                className={`text-[9px] sm:text-[10px] font-black uppercase tracking-wider px-2.5 py-0.5 rounded-full flex items-center gap-1.5 ${
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
            {isSessionOpen && activeSession ? (
              <p className="text-[11px] sm:text-xs text-slate-500 dark:text-slate-400 mt-0.5 truncate">
                Session{' '}
                <span className="font-mono font-bold text-slate-800 dark:text-slate-200">
                  {activeSession.session_number}
                </span>{' '}
                • Opened by {activeSession.opened_by_name} at{' '}
                {format(new Date(activeSession.opened_at), 'h:mm a')}
              </p>
            ) : (
              <p className="text-[11px] sm:text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                No cash session currently active. Money transactions require an
                open session.
              </p>
            )}
          </div>
        </div>

        {/* 2x2 Grid on Mobile, Flex on Desktop */}
        {isSessionOpen && (
          <div className="grid grid-cols-2 sm:flex sm:flex-wrap items-center gap-2 pt-2 sm:pt-0 border-t sm:border-t-0 border-slate-100 dark:border-white/5">
            <button
              onClick={() => setActiveTxType('cash_in')}
              className="px-3.5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white text-xs font-bold flex items-center justify-center gap-1.5 shadow-sm transition-all duration-150 cursor-pointer"
            >
              <ArrowDownRight className="w-4 h-4" />
              Cash In
            </button>
            <button
              onClick={() => setActiveTxType('cash_out')}
              className="px-3.5 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 active:scale-95 text-white text-xs font-bold flex items-center justify-center gap-1.5 shadow-sm transition-all duration-150 cursor-pointer"
            >
              <ArrowUpRight className="w-4 h-4" />
              Cash Out
            </button>
            <button
              onClick={() => setActiveTxType('digital_in')}
              className="px-3.5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 active:scale-95 text-white text-xs font-bold flex items-center justify-center gap-1.5 shadow-sm transition-all duration-150 cursor-pointer"
            >
              <Smartphone className="w-4 h-4" />
              Digital In
            </button>
            {isAdmin && (
              <button
                onClick={() => setShowCloseModal(true)}
                className="px-3.5 py-2.5 rounded-xl bg-[#123c73] hover:bg-[#0f2e59] dark:bg-[#bf0202] dark:hover:bg-[#a60303] active:scale-95 text-white text-xs font-bold flex items-center justify-center gap-1.5 shadow-sm transition-all duration-150 cursor-pointer"
              >
                <ShieldCheck className="w-4 h-4 text-emerald-400" />
                Close Session
              </button>
            )}
          </div>
        )}
      </div>

      {/* Main Drawer Ledger & Metrics */}
      {isSessionOpen ? (
        <div className="space-y-6">
          <CashMetricsCards metrics={metrics} />

          <div className="space-y-3">
            <div>
              <h3 className="text-sm font-heading font-black uppercase tracking-wider text-slate-900 dark:text-white">
                SESSION ACTIVITY LEDGER
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Real-time log of physical cash inflows, outflows, and digital
                collections.
              </p>
            </div>
            <CashTransactionsTable
              transactions={transactions}
              isLoading={isLoading}
            />
          </div>
        </div>
      ) : (
        /* Closed State */
        <div className="bg-white dark:bg-[#12151c] border border-slate-200 dark:border-white/10 rounded-2xl p-5 sm:p-8 shadow-xs">
          {isAdmin ? (
            <div className="max-w-xl mx-auto text-center space-y-6">
              <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-3xl bg-[#123c73]/10 dark:bg-[#bf0202]/15 text-[#123c73] dark:text-[#bf0202] flex items-center justify-center mx-auto transition-transform hover:scale-105">
                <Wallet className="w-7 h-7 sm:w-8 sm:h-8" />
              </div>

              <div>
                <h3 className="text-lg sm:text-xl font-heading font-black text-slate-900 dark:text-white">
                  START NEW CASH SESSION
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 max-w-md mx-auto">
                  Start today's cash session by setting the physical opening
                  float in the cash drawer.
                </p>
              </div>

              <form
                onSubmit={handleStartSession}
                className="space-y-4 sm:space-y-5 text-left"
              >
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300">
                      Opening Float Amount (₱) *
                    </label>
                    {lastCountedCash !== null && (
                      <span className="text-[10px] sm:text-[11px] text-slate-500 dark:text-slate-400 font-mono">
                        Last Session:{' '}
                        <strong className="text-emerald-600 dark:text-emerald-400">
                          ₱
                          {lastCountedCash.toLocaleString('en-US', {
                            minimumFractionDigits: 2,
                          })}
                        </strong>
                      </span>
                    )}
                  </div>

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
                      className="w-full pl-10 pr-4 py-3 sm:py-3.5 bg-slate-50 dark:bg-[#0c0e12] border border-slate-200 dark:border-white/10 rounded-2xl text-xl font-heading font-black text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#123c73] dark:focus:ring-[#bf0202]"
                    />
                  </div>

                  <div className="flex flex-wrap items-center gap-1.5 sm:gap-2 mt-2.5">
                    {lastCountedCash !== null && (
                      <button
                        type="button"
                        onClick={() =>
                          setOpeningFloatInput(lastCountedCash.toString())
                        }
                        className={`px-2.5 sm:px-3 py-1.5 rounded-xl text-xs font-bold transition-all duration-150 active:scale-95 flex items-center gap-1.5 ${
                          openingFloatInput === lastCountedCash.toString()
                            ? 'bg-emerald-600 text-white shadow-xs'
                            : 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 hover:bg-emerald-500/20'
                        }`}
                      >
                        <RotateCcw className="w-3 h-3" />
                        Last: ₱{lastCountedCash.toLocaleString()}
                      </button>
                    )}

                    {PRESET_FLOATS.map((preset) => (
                      <button
                        type="button"
                        key={preset}
                        onClick={() => setOpeningFloatInput(preset.toString())}
                        className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all duration-150 active:scale-95 ${
                          openingFloatInput === preset.toString()
                            ? 'bg-[#123c73] text-white dark:bg-[#bf0202] dark:text-white shadow-xs'
                            : 'bg-slate-100 hover:bg-slate-200 dark:bg-[#161920] dark:hover:bg-[#1e232d] text-slate-700 dark:text-slate-300 border border-slate-200/80 dark:border-white/10'
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
                    className="w-full px-4 py-3 bg-slate-50 dark:bg-[#0c0e12] border border-slate-200 dark:border-white/10 rounded-2xl text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#123c73] dark:focus:ring-[#bf0202] resize-none"
                  />
                </div>

                <Button
                  type="submit"
                  loading={isOpeningSession}
                  className="w-full py-3.5 sm:py-4 text-xs sm:text-sm font-heading font-black tracking-wider shadow-sm transition-all duration-150 active:scale-[0.99] bg-[#123c73] hover:bg-[#0f2e59] dark:bg-[#bf0202] dark:hover:bg-[#a60303] text-white"
                >
                  <Play className="w-4 h-4 mr-1.5" />
                  OPEN TODAY'S CASH SESSION
                </Button>
              </form>
            </div>
          ) : (
            <div className="max-w-md mx-auto text-center py-8 space-y-4">
              <div className="w-14 h-14 rounded-2xl bg-amber-500/10 text-amber-600 flex items-center justify-center mx-auto">
                <Lock className="w-7 h-7" />
              </div>
              <h3 className="text-base font-heading font-black">
                CASH SESSION IS CURRENTLY CLOSED
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                An administrator must open today's cash drawer session with an
                initial opening float before cash payments or manual movements
                can be accepted.
              </p>
            </div>
          )}
        </div>
      )}

      {/* CASH SESSIONS HISTORY (5 rows per page with pagination) - Admin Only */}
      {isAdmin && (
        <div className="space-y-3 pt-2">
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

          {/* Desktop & Tablet View: Reusable Table Component (5 rows per page) */}
          <div className="hidden md:block">
            <Table<CashSession>
              data={history}
              columns={historyColumns}
              itemsPerPage={SESSIONS_PER_PAGE}
              searchKeys={[
                'session_number',
                'opened_by_name',
                'closed_by_name',
                'notes',
              ]}
              searchPlaceholder="Search session # or staff..."
              defaultSortKey="closed_at"
              defaultSortDirection="desc"
            />
          </div>

          {/* Mobile View: 5 cards per page with clean page controls */}
          <div className="md:hidden space-y-3">
            <div className="bg-white dark:bg-[#12151c] border border-slate-200 dark:border-white/10 rounded-2xl divide-y divide-slate-100 dark:divide-white/5 overflow-hidden shadow-xs">
              {history.length === 0 ? (
                <div className="p-8 text-center text-xs text-slate-400">
                  No historical cash sessions recorded yet.
                </div>
              ) : (
                paginatedMobileHistory.map((s) => {
                  const disc = Number(s.discrepancy || 0);
                  return (
                    <div
                      key={s.id}
                      className="p-3.5 space-y-2.5 active:bg-slate-50 dark:active:bg-[#10131b]/60 transition-colors"
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-mono font-black text-xs text-slate-900 dark:text-white">
                          {s.session_number}
                        </span>
                        <span
                          className={`inline-flex items-center gap-1 text-[9px] font-black uppercase px-2 py-0.5 rounded-full ${
                            disc === 0
                              ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400'
                              : disc > 0
                                ? 'bg-amber-500/15 text-amber-600 dark:text-amber-400'
                                : 'bg-rose-500/15 text-rose-600 dark:text-rose-400'
                          }`}
                        >
                          {disc === 0 && (
                            <CheckCircle2 className="w-2.5 h-2.5" />
                          )}
                          {disc !== 0 && (
                            <AlertTriangle className="w-2.5 h-2.5" />
                          )}
                          {disc === 0
                            ? 'BALANCED'
                            : disc > 0
                              ? `+₱${disc.toFixed(0)} OVER`
                              : `-₱${Math.abs(disc).toFixed(0)} SHORT`}
                        </span>
                      </div>

                      <div className="grid grid-cols-2 gap-2 text-[11px] bg-slate-50/70 dark:bg-[#0c0e12]/60 border border-slate-100 dark:border-white/5 p-2.5 rounded-xl">
                        <div>
                          <p className="text-[10px] text-slate-400 uppercase font-bold">
                            Float In
                          </p>
                          <p className="font-mono font-bold text-slate-700 dark:text-slate-300">
                            ₱{Number(s.opening_float || 0).toFixed(2)}
                          </p>
                        </div>
                        <div>
                          <p className="text-[10px] text-slate-400 uppercase font-bold">
                            Counted Out
                          </p>
                          <p className="font-mono font-bold text-slate-900 dark:text-white">
                            ₱{Number(s.closing_actual_cash || 0).toFixed(2)}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400">
                        <span className="truncate">
                          Closed:{' '}
                          {s.closed_at
                            ? format(new Date(s.closed_at), 'MMM d, h:mm a')
                            : 'In progress'}
                        </span>
                        <button
                          onClick={() => setSelectedHistorySession(s)}
                          className="px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 active:scale-95 dark:bg-[#161920] dark:hover:bg-[#1e232d] border border-slate-200/80 dark:border-white/10 text-slate-700 dark:text-slate-300 text-[11px] font-bold inline-flex items-center gap-1 transition-all cursor-pointer shadow-xs"
                        >
                          <Eye className="w-3 h-3" />
                          Details
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* Mobile Pagination Footer Controls */}
            {history.length > SESSIONS_PER_PAGE && (
              <div className="flex items-center justify-between px-1 py-1 text-xs">
                <span className="text-slate-500 dark:text-slate-400 text-[11px]">
                  Page {mobileHistoryPage} of {totalMobilePages} (
                  {history.length} total)
                </span>

                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() =>
                      setMobileHistoryPage((prev) => Math.max(prev - 1, 1))
                    }
                    disabled={mobileHistoryPage === 1}
                    className="p-2 border border-slate-200/80 dark:border-white/10 dark:bg-[#161920] rounded-lg hover:bg-slate-100 dark:hover:bg-[#1e232d] text-slate-700 dark:text-slate-300 disabled:opacity-40 disabled:pointer-events-none active:scale-95 transition-all cursor-pointer"
                    aria-label="Previous page"
                  >
                    <ChevronLeft className="w-3.5 h-3.5" />
                  </button>

                  {Array.from(
                    { length: totalMobilePages },
                    (_, i) => i + 1
                  ).map((p) => (
                    <button
                      key={p}
                      type="button"
                      onClick={() => setMobileHistoryPage(p)}
                      className={`w-7 h-7 rounded-lg text-xs font-mono font-bold transition-all cursor-pointer ${
                        mobileHistoryPage === p
                          ? 'bg-[#123c73] dark:bg-[#bf0202] text-white shadow-xs'
                          : 'border border-slate-200/80 dark:border-white/10 dark:bg-[#161920] text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-[#1e232d]'
                      }`}
                    >
                      {p}
                    </button>
                  ))}

                  <button
                    type="button"
                    onClick={() =>
                      setMobileHistoryPage((prev) =>
                        Math.min(prev + 1, totalMobilePages)
                      )
                    }
                    disabled={mobileHistoryPage === totalMobilePages}
                    className="p-2 border border-slate-200/80 dark:border-white/10 dark:bg-[#161920] rounded-lg hover:bg-slate-100 dark:hover:bg-[#1e232d] text-slate-700 dark:text-slate-300 disabled:opacity-40 disabled:pointer-events-none active:scale-95 transition-all cursor-pointer"
                    aria-label="Next page"
                  >
                    <ChevronRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Unified Modals */}
      {isSessionOpen && activeSession && activeTxType && (
        <CashTransactionModal
          isOpen={Boolean(activeTxType)}
          onClose={() => setActiveTxType(null)}
          type={activeTxType}
          sessionId={activeSession.id}
          currentDrawerCash={currentDrawerCash}
          onSuccess={refreshTransactions}
        />
      )}

      {isSessionOpen && activeSession && showCloseModal && (
        <CloseSessionModal
          isOpen={showCloseModal}
          onClose={() => setShowCloseModal(false)}
          session={activeSession}
          metrics={metrics}
          onSuccess={async () => {
            useCashSessionStore.getState().setSessionClosed();
            await loadActiveSession();
            if (isAdmin) {
              await loadHistory();
            }
          }}
        />
      )}
      {isAdmin && selectedHistorySession && (
        <SessionDetailsModal
          isOpen={Boolean(selectedHistorySession)}
          onClose={() => setSelectedHistorySession(null)}
          session={selectedHistorySession}
        />
      )}
    </div>
  );
};

export default CashManagementPage;
