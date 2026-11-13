import React, { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import {
  Database,
  ShieldAlert,
  Lock,
  Eye,
  EyeOff,
  Plus,
  Trash2,
  Calendar,
  Loader2,
  X,
  Copy,
  AlertTriangle,
} from 'lucide-react';
import { toast } from 'react-toastify';
import { supabase } from '../../../lib/supabase/client';
import { logAudit } from '../../../lib/supabase/audit';
import { useAuthStore } from '../../../stores/authStore';
import { useCashSessionStore } from '../../../stores/useCashSessionStore';
import { isSuperAdmin } from '../../../constants/auth';
import { cardService } from '../memberService';
import googleIcon from '../../../assets/Google_Icon.webp';

interface MigrationRow {
  tempId: string;
  fullName: string;
  planType: 'none' | 'monthly' | 'yearly';
  startDate: string;
  endDate: string;
  issueCard: boolean;
  cardType: 'QR' | 'Manual';
}

interface LegacyDataMigrationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

const formatDateToInput = (d: Date): string => {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const createEmptyRow = (): MigrationRow => {
  const now = new Date();
  const end = new Date(now);
  end.setDate(end.getDate() + 30);

  return {
    tempId: `row_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    fullName: '',
    planType: 'monthly',
    startDate: formatDateToInput(now),
    endDate: formatDateToInput(end),
    issueCard: false,
    cardType: 'QR',
  };
};

export const LegacyDataMigrationModal: React.FC<LegacyDataMigrationModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
}) => {
  const { user } = useAuthStore();
  const isSuper = isSuperAdmin(user?.email);
  const { isSessionOpen } = useCashSessionStore();

  // Re-authentication Gate States
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
  const [isVerifyingAuth, setIsVerifyingAuth] = useState<boolean>(false);
  const [authPassword, setAuthPassword] = useState<string>('');
  const [showAuthPassword, setShowAuthPassword] = useState<boolean>(false);
  const [hasPassword, setHasPassword] = useState<boolean>(true);

  // Migration Batch States
  const [rows, setRows] = useState<MigrationRow[]>([createEmptyRow()]);
  const [isMigrating, setIsMigrating] = useState<boolean>(false);
  const [migrationProgress, setMigrationProgress] = useState<number>(0);

  // Check whether SuperAdmin uses Password or Google OAuth
  useEffect(() => {
    let isMounted = true;
    const checkPasswordStatus = async () => {
      if (!isOpen || !user) return;
      try {
        const { data, error } = await supabase.rpc('check_user_has_password');
        if (!error && typeof data === 'boolean' && isMounted) {
          setHasPassword(data);
          return;
        }
      } catch {}

      if (isMounted) {
        const rawProviders = user.app_metadata?.providers || [];
        const isGoogleOnly =
          rawProviders.includes('google') && !rawProviders.includes('email');
        setHasPassword(!isGoogleOnly);
      }
    };

    checkPasswordStatus();
    return () => {
      isMounted = false;
    };
  }, [isOpen, user]);

  useEffect(() => {
    if (isOpen) {
      setIsAuthenticated(false);
      setAuthPassword('');
      setShowAuthPassword(false);
      setRows([createEmptyRow()]);
      setIsMigrating(false);
      setMigrationProgress(0);
    }
  }, [isOpen]);

  const verifyCurrentPassword = async (password: string): Promise<boolean> => {
    try {
      const { data: isValidPassword, error: authError } = await supabase.rpc(
        'verify_user_password',
        { entered_password: password }
      );
      if (!authError && typeof isValidPassword === 'boolean') {
        return isValidPassword;
      }
    } catch {
      // Fallback to direct sign-in check
    }

    if (user?.email) {
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: user.email,
        password,
      });
      return !signInError;
    }

    return false;
  };

  const handleAuthorizeAccess = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isSuper) {
      toast.error('Access denied. SuperAdmin privileges required.');
      return;
    }

    if (isSessionOpen) {
      toast.warning(
        'Cannot unlock migration while cash drawer session is open. Close cash session in Cash Management first.'
      );
      return;
    }

    if (hasPassword) {
      if (!authPassword.trim()) {
        toast.error('Please enter your SuperAdmin account password.');
        return;
      }

      try {
        setIsVerifyingAuth(true);
        const valid = await verifyCurrentPassword(authPassword.trim());
        if (!valid) {
          toast.error('Authorization failed. Incorrect password.');
          return;
        }
        setIsAuthenticated(true);
        toast.success('SuperAdmin identity authorized. Workspace unlocked.');
      } catch {
        toast.error('Authorization failed. Could not verify credentials.');
      } finally {
        setIsVerifyingAuth(false);
      }
    } else {
      setIsAuthenticated(true);
      toast.success('SuperAdmin Google identity authorized.');
    }
  };

  const handleAddRow = () => {
    setRows((prev) => [...prev, createEmptyRow()]);
  };

  const handleAddMultipleRows = (count: number) => {
    const newItems: MigrationRow[] = [];
    for (let i = 0; i < count; i++) {
      newItems.push(createEmptyRow());
    }
    setRows((prev) => [...prev, ...newItems]);
  };

  const handleRemoveRow = (tempId: string) => {
    if (rows.length === 1) {
      setRows([createEmptyRow()]);
      return;
    }
    setRows((prev) => prev.filter((r) => r.tempId !== tempId));
  };

  const handleDuplicateRow = (row: MigrationRow) => {
    setRows((prev) => [
      ...prev,
      {
        ...row,
        tempId: `row_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        fullName: `${row.fullName} (Copy)`,
      },
    ]);
  };

  const updateRow = (tempId: string, updates: Partial<MigrationRow>) => {
    setRows((prev) =>
      prev.map((r) => {
        if (r.tempId !== tempId) return r;
        const next = { ...r, ...updates };

        // Auto-recalculate End Date when Start Date or Plan Type changes
        if (updates.startDate || updates.planType) {
          const currentPlan = updates.planType ?? r.planType;
          const currentStartStr = updates.startDate ?? r.startDate;

          if (currentPlan === 'none') {
            next.endDate = '';
          } else if (currentStartStr) {
            const startD = new Date(currentStartStr);
            if (!isNaN(startD.getTime())) {
              const endD = new Date(startD);
              if (currentPlan === 'monthly') {
                endD.setDate(endD.getDate() + 30);
              } else if (currentPlan === 'yearly') {
                endD.setDate(endD.getDate() + 365);
              }
              next.endDate = formatDateToInput(endD);
            }
          }
        }

        return next;
      })
    );
  };

  // Helper to validate duration constraints
  const getRowDurationInfo = (row: MigrationRow) => {
    if (row.planType === 'none' || !row.startDate || !row.endDate) {
      return { days: 0, isInvalid: false, message: '' };
    }

    const startMs = new Date(row.startDate).getTime();
    const endMs = new Date(row.endDate).getTime();

    if (isNaN(startMs) || isNaN(endMs)) {
      return { days: 0, isInvalid: true, message: 'Invalid date selection.' };
    }

    const diffDays = Math.round((endMs - startMs) / (1000 * 60 * 60 * 24));

    if (diffDays <= 0) {
      return {
        days: diffDays,
        isInvalid: true,
        message: 'End date must be after start date.',
      };
    }

    if (row.planType === 'monthly' && diffDays > 31) {
      return {
        days: diffDays,
        isInvalid: true,
        message: `Exceeds 1 month (${diffDays} days). Max allowed is 31 days.`,
      };
    }

    if (row.planType === 'yearly' && diffDays > 366) {
      return {
        days: diffDays,
        isInvalid: true,
        message: `Exceeds 1 year (${diffDays} days). Max allowed is 366 days.`,
      };
    }

    return { days: diffDays, isInvalid: false, message: `${diffDays} days` };
  };

  const handleRunMigration = async () => {
    if (!isSuper) {
      toast.error('Only SuperAdmin can perform batch data migration.');
      return;
    }

    if (isSessionOpen) {
      toast.error(
        'Cannot migrate legacy records while a cash drawer session is open. Please close the cash session first.'
      );
      return;
    }

    const trimmedRows = rows.map((r) => ({
      ...r,
      fullName: r.fullName.trim().toUpperCase(),
    }));

    // Validation
    for (let i = 0; i < trimmedRows.length; i++) {
      const row = trimmedRows[i];
      if (!row.fullName) {
        toast.error(`Row #${i + 1}: Member Full Name is required.`);
        return;
      }

      if (row.planType !== 'none') {
        if (!row.startDate) {
          toast.error(`Row #${i + 1} (${row.fullName}): Subscription Start Date is required.`);
          return;
        }
        if (!row.endDate) {
          toast.error(`Row #${i + 1} (${row.fullName}): Subscription End Date is required.`);
          return;
        }

        const durationInfo = getRowDurationInfo(row);
        if (durationInfo.isInvalid) {
          toast.error(`Row #${i + 1} (${row.fullName}): ${durationInfo.message}`);
          return;
        }
      }
    }

    try {
      setIsMigrating(true);
      setMigrationProgress(0);

      const total = trimmedRows.length;
      let insertedCount = 0;
      let subscriptionCount = 0;
      let cardCount = 0;

      for (let i = 0; i < total; i++) {
        const row = trimmedRows[i];

        // 1. Create Member record in Supabase
        // phone and gender are provided default fallbacks since old manual ledgers didn't record them
        const memberPayload = {
          full_name: row.fullName,
          phone: 'No Phone',
          gender: 'Male',
          birthday: null,
          status: 'Active',
          notes: 'Imported via SuperAdmin Legacy Data Migration',
        };

        const { data: memberData, error: memErr } = await supabase
          .from('members')
          .insert([memberPayload])
          .select()
          .single();

        if (memErr) throw memErr;
        insertedCount++;

        // 2. Create Subscription record if a plan is assigned
        if (row.planType !== 'none') {
          const startIso = new Date(row.startDate).toISOString();
          const endIso = new Date(row.endDate + 'T23:59:59').toISOString();
          const isExpired = new Date(endIso).getTime() < Date.now();
          const receiptNo = `MIG-REC-${Date.now().toString().slice(-6)}-${i + 1}`;

          const { error: subErr } = await supabase.from('subscriptions').insert([
            {
              member_id: memberData.member_id,
              plan_type: row.planType,
              price: 0.0,
              base_price: 0.0,
              gcash_fee: 0.0,
              card_fee: 0.0,
              start_date: startIso,
              end_date: endIso,
              status: isExpired ? 'Expired' : 'Active',
              payment_status: 'Paid',
              payment_method: 'Cash',
              receipt_number: receiptNo,
            },
          ]);

          if (subErr) {
            console.warn(`Subscription insertion note for ${row.fullName}:`, subErr.message);
          } else {
            subscriptionCount++;
          }
        }

        // 3. Issue Member Card if selected
        if (row.issueCard) {
          try {
            await cardService.issue(
              memberData.member_id,
              row.cardType,
              'SuperAdmin Migration',
              undefined,
              'PAID',
              'CLAIMED',
              0
            );
            cardCount++;
          } catch (cardErr) {
            console.warn(`Card issuance note for ${row.fullName}:`, cardErr);
          }
        }

        setMigrationProgress(Math.round(((i + 1) / total) * 100));
      }

      // Purge cached storage
      sessionStorage.removeItem('members_sanitized_cache');
      localStorage.removeItem('members_sanitized_cache');

      await logAudit(
        'LEGACY_DATA_MIGRATION',
        `SuperAdmin imported ${insertedCount} member(s), ${subscriptionCount} subscription contract(s), and ${cardCount} credential card(s).`,
        user?.id
      );

      toast.success(
        `Migration complete! Enrolled ${insertedCount} members (${subscriptionCount} subscriptions, ${cardCount} cards).`
      );

      window.dispatchEvent(new Event('member-refresh'));
      window.dispatchEvent(new Event('palomar_logbook_updated'));

      onSuccess();
      onClose();
    } catch (err: any) {
      toast.error(err.message || 'Legacy data migration encountered an error.');
    } finally {
      setIsMigrating(false);
    }
  };

  const planBreakdown = useMemo(() => {
    let monthly = 0;
    let yearly = 0;
    let profileOnly = 0;
    let cards = 0;

    rows.forEach((r) => {
      if (r.planType === 'monthly') monthly++;
      else if (r.planType === 'yearly') yearly++;
      else profileOnly++;

      if (r.issueCard) cards++;
    });

    return { monthly, yearly, profileOnly, cards };
  }, [rows]);

  if (!isOpen) return null;

  return createPortal(
    <div className="fixed inset-0 z-[2500] flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-md animate-fade-in font-sans select-none">
      <div className="relative bg-(--bg-card) text-(--color-text) border border-(--border-color) rounded-3xl w-full shadow-2xl overflow-hidden flex flex-col max-h-[92vh] max-w-5xl transition-all">
        {/* TOP ACCENT STRIP */}
        <div className="w-full h-1.5 bg-gradient-to-r from-amber-500 via-blue-700 to-blue-500" />

        {/* HEADER */}
        <div className="p-4 sm:p-5 border-b border-(--border-color) flex items-center justify-between bg-(--bg-card) shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-amber-500/15 border border-amber-500/30 text-amber-500 flex items-center justify-center shrink-0 shadow-xs">
              <Database className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="font-heading font-black text-sm uppercase tracking-wider text-(--color-text)">
                  Legacy Data Migration
                </h3>
                <span className="px-2 py-0.5 rounded-full text-[9px] font-mono font-extrabold uppercase bg-amber-500/15 text-amber-700 dark:text-amber-400 border border-amber-500/30">
                  SuperAdmin Exclusive
                </span>
              </div>
              <p className="text-[11px] text-slate-400 leading-tight mt-0.5">
                Batch import historical records. Only Name, Membership, Start Date, and End Date are needed.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            disabled={isMigrating}
            className="w-8 h-8 rounded-xl bg-(--bg-input) hover:bg-(--bg-card) text-slate-400 hover:text-(--color-text) border border-(--border-color) flex items-center justify-center transition-colors cursor-pointer disabled:opacity-40"
            title="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* ACTIVE CASH SESSION WARNING BLOCKER */}
        {isSessionOpen ? (
          <div className="p-6 sm:p-8 space-y-4 max-w-md mx-auto my-auto text-center w-full">
            <div className="w-14 h-14 rounded-3xl bg-amber-500/15 border border-amber-500/30 text-amber-500 flex items-center justify-center mx-auto shadow-sm">
              <Lock className="w-7 h-7" />
            </div>

            <div className="space-y-1.5">
              <h3 className="font-heading font-black text-sm uppercase tracking-wider text-slate-900 dark:text-white">
                CASH REGISTER SESSION IS OPEN
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed font-medium">
                Legacy data migration is disabled while a live cash drawer session is open. Please close the active session in Cash Management before migrating historical records to maintain drawer balance integrity.
              </p>
            </div>

            <button
              type="button"
              onClick={onClose}
              className="px-5 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-heading text-xs font-bold uppercase tracking-wider transition-colors cursor-pointer"
            >
              Close Window
            </button>
          </div>
        ) : !isAuthenticated ? (
          /* STEP A: SUPERADMIN RE-AUTHENTICATION GATE */
          <div className="p-6 sm:p-8 space-y-6 max-w-md mx-auto my-auto text-left w-full">
            <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-amber-800 dark:text-amber-300 flex items-start gap-3 text-xs">
              <ShieldAlert className="w-6 h-6 text-amber-500 shrink-0 mt-0.5" />
              <div className="space-y-1">
                <span className="font-heading text-[10px] font-extrabold uppercase tracking-wider block text-amber-700 dark:text-amber-400">
                  SECURITY AUTHORIZATION REQUIRED
                </span>
                <p className="leading-relaxed font-medium text-slate-700 dark:text-slate-300">
                  Legacy data migration performs direct multi-row database insertions without billing ledger restrictions. Please verify your SuperAdmin credentials to unlock this console.
                </p>
              </div>
            </div>

            <form onSubmit={handleAuthorizeAccess} className="space-y-4">
              <div className="space-y-1">
                <label className="text-[10px] font-heading font-extrabold uppercase tracking-wider text-slate-400 block">
                  SuperAdmin Account
                </label>
                <div className="p-2.5 rounded-xl bg-(--bg-input) border border-(--border-color) text-xs font-mono font-bold text-(--color-text) flex items-center justify-between">
                  <span>{user?.email || 'superadmin'}</span>
                  <span className="text-[9px] text-amber-500 uppercase font-sans">
                    Owner
                  </span>
                </div>
              </div>

              {hasPassword ? (
                <div className="space-y-1.5">
                  <label className="text-[10px] font-heading font-extrabold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                    <Lock className="w-3.5 h-3.5 text-amber-500" />
                    <span>Enter SuperAdmin Password</span>
                  </label>
                  <div className="relative">
                    <input
                      type={showAuthPassword ? 'text' : 'password'}
                      value={authPassword}
                      onChange={(e) => setAuthPassword(e.target.value)}
                      placeholder="SuperAdmin password..."
                      autoComplete="off"
                      spellCheck={false}
                      autoCorrect="off"
                      className="w-full px-3.5 py-2.5 pr-10 rounded-xl border border-(--border-color) bg-(--bg-page) text-xs text-(--color-text) outline-none focus:border-amber-500 transition-colors font-mono"
                      autoFocus
                    />
                    <button
                      type="button"
                      onClick={() => setShowAuthPassword(!showAuthPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-(--color-text) cursor-pointer p-0.5"
                    >
                      {showAuthPassword ? (
                        <EyeOff className="w-4 h-4" />
                      ) : (
                        <Eye className="w-4 h-4" />
                      )}
                    </button>
                  </div>
                </div>
              ) : (
                <div className="p-3 rounded-xl bg-blue-500/10 border border-blue-500/20 text-blue-600 dark:text-blue-400 flex items-center gap-2.5 text-xs">
                  <img
                    src={googleIcon}
                    alt="Google"
                    className="w-4 h-4 object-contain shrink-0"
                  />
                  <span>
                    Authenticated via Google SSO. Click below to confirm authorization.
                  </span>
                </div>
              )}

              <button
                type="submit"
                disabled={isVerifyingAuth || (hasPassword && !authPassword.trim())}
                className="w-full py-3 bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-slate-950 font-heading font-black text-xs uppercase tracking-wider rounded-xl cursor-pointer shadow-md transition-all flex items-center justify-center gap-2"
              >
                {isVerifyingAuth ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Verifying...</span>
                  </>
                ) : (
                  <>
                    <Lock className="w-4 h-4" />
                    <span>Authorize & Unlock Migration</span>
                  </>
                )}
              </button>
            </form>
          </div>
        ) : (
          /* STEP B: BATCH DATA MIGRATION SPREADSHEET CONSOLE */
          <div className="flex-1 overflow-hidden flex flex-col">
            {/* TOOLBAR & KPI SUMMARY */}
            <div className="p-4 border-b border-(--border-color) bg-(--bg-card) flex flex-wrap items-center justify-between gap-3 shrink-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs font-heading font-extrabold text-(--color-text) uppercase tracking-wider">
                  Entries to Migrate ({rows.length})
                </span>
                <span className="text-slate-300 dark:text-zinc-700">•</span>
                <span className="text-[11px] font-mono text-emerald-600 dark:text-emerald-400 font-bold">
                  {planBreakdown.monthly} Monthly
                </span>
                <span className="text-slate-300 dark:text-zinc-700">•</span>
                <span className="text-[11px] font-mono text-blue-600 dark:text-blue-400 font-bold">
                  {planBreakdown.yearly} Yearly
                </span>
                <span className="text-slate-300 dark:text-zinc-700">•</span>
                <span className="text-[11px] font-mono text-slate-500 font-bold">
                  {planBreakdown.profileOnly} Profile Only
                </span>
                <span className="text-slate-300 dark:text-zinc-700">•</span>
                <span className="text-[11px] font-mono text-sky-600 dark:text-sky-400 font-bold">
                  {planBreakdown.cards} Cards
                </span>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => handleAddMultipleRows(5)}
                  disabled={isMigrating}
                  className="px-3 py-1.5 rounded-xl border border-(--border-color) bg-(--bg-input) hover:bg-(--bg-card) text-(--color-text) text-[11px] font-heading font-bold uppercase tracking-wider cursor-pointer shadow-xs transition-colors"
                >
                  +5 Rows
                </button>

                <button
                  type="button"
                  onClick={handleAddRow}
                  disabled={isMigrating}
                  className="px-3.5 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-[11px] font-heading font-bold uppercase tracking-wider cursor-pointer shadow-xs transition-colors flex items-center gap-1.5"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Add Member</span>
                </button>
              </div>
            </div>

            {/* PROGRESS BAR (WHEN EXECUTING) */}
            {isMigrating && (
              <div className="w-full bg-(--bg-input) h-2 relative overflow-hidden">
                <div
                  className="bg-emerald-500 h-full transition-all duration-200"
                  style={{ width: `${migrationProgress}%` }}
                />
              </div>
            )}

            {/* SCROLLABLE ROWS AREA */}
            <div className="flex-1 overflow-y-auto p-3 sm:p-5 space-y-3">
              {rows.map((row, idx) => {
                const duration = getRowDurationInfo(row);

                return (
                  <div
                    key={row.tempId}
                    className="p-3.5 rounded-2xl border border-(--border-color) bg-(--bg-page) space-y-3 transition-colors shadow-xs"
                  >
                    <div className="flex items-center justify-between gap-2 border-b border-(--border-color) pb-2.5">
                      <div className="flex items-center gap-2">
                        <span className="w-6 h-6 rounded-lg bg-slate-200 dark:bg-zinc-800 text-slate-700 dark:text-slate-300 text-xs font-mono font-black flex items-center justify-center">
                          {idx + 1}
                        </span>
                        <span className="font-heading font-black text-xs uppercase tracking-wider text-(--color-text)">
                          {row.fullName.trim() || 'New Member Record'}
                        </span>
                      </div>

                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => handleDuplicateRow(row)}
                          disabled={isMigrating}
                          className="p-1.5 rounded-lg text-slate-400 hover:text-(--color-text) hover:bg-slate-200 dark:hover:bg-zinc-800 transition-colors cursor-pointer"
                          title="Duplicate row"
                        >
                          <Copy className="w-3.5 h-3.5" />
                        </button>

                        <button
                          type="button"
                          onClick={() => handleRemoveRow(row.tempId)}
                          disabled={isMigrating}
                          className="p-1.5 rounded-lg text-rose-500 hover:bg-rose-500/10 transition-colors cursor-pointer"
                          title="Remove row"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>

                    {/* STREAMLINED FORM FIELDS GRID */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-12 gap-2.5 text-left items-start">
                      {/* Full Name (5 cols) */}
                      <div className="md:col-span-5 space-y-1">
                        <label className="text-[10px] font-heading font-bold text-slate-400 uppercase tracking-wider block">
                          Member Full Name *
                        </label>
                        <input
                          type="text"
                          value={row.fullName}
                          disabled={isMigrating}
                          onChange={(e) =>
                            updateRow(row.tempId, { fullName: e.target.value })
                          }
                          placeholder="e.g. Angeles, Adrian"
                          autoComplete="off"
                          spellCheck={false}
                          autoCorrect="off"
                          className="w-full px-3 py-2 bg-(--bg-card) border border-(--border-color) rounded-xl text-xs font-bold uppercase text-(--color-text) outline-none focus:border-blue-500"
                        />
                      </div>

                      {/* Plan Type (3 cols) */}
                      <div className="md:col-span-3 space-y-1">
                        <label className="text-[10px] font-heading font-bold text-slate-400 uppercase tracking-wider block">
                          Membership Plan
                        </label>
                        <select
                          value={row.planType}
                          disabled={isMigrating}
                          onChange={(e) =>
                            updateRow(row.tempId, {
                              planType: e.target.value as any,
                            })
                          }
                          className="w-full px-3 py-2 bg-(--bg-card) border border-(--border-color) rounded-xl text-xs font-bold text-(--color-text) outline-none focus:border-blue-500 cursor-pointer"
                        >
                          <option value="monthly">Monthly Membership</option>
                          <option value="yearly">Yearly Membership</option>
                          <option value="none">No Subscription (Profile Only)</option>
                        </select>
                      </div>

                      {/* Start Date (2 cols) */}
                      {row.planType !== 'none' ? (
                        <div className="md:col-span-2 space-y-1">
                          <label className="text-[10px] font-heading font-bold text-emerald-600 dark:text-emerald-400 uppercase tracking-wider flex items-center gap-1">
                            <Calendar className="w-3 h-3" />
                            <span>Start Date</span>
                          </label>
                          <input
                            type="date"
                            value={row.startDate}
                            disabled={isMigrating}
                            onChange={(e) =>
                              updateRow(row.tempId, { startDate: e.target.value })
                            }
                            className="w-full px-2.5 py-2 bg-(--bg-card) border border-(--border-color) rounded-xl text-xs font-mono font-bold text-(--color-text) outline-none focus:border-emerald-500"
                          />
                        </div>
                      ) : (
                        <div className="md:col-span-4" />
                      )}

                      {/* End Date (2 cols) with Smart Validation */}
                      {row.planType !== 'none' && (
                        <div className="md:col-span-2 space-y-1">
                          <label className="text-[10px] font-heading font-bold text-blue-600 dark:text-blue-400 uppercase tracking-wider flex items-center justify-between">
                            <span className="flex items-center gap-1">
                              <Calendar className="w-3 h-3" />
                              <span>End Date</span>
                            </span>
                          </label>
                          <input
                            type="date"
                            value={row.endDate}
                            disabled={isMigrating}
                            onChange={(e) =>
                              updateRow(row.tempId, { endDate: e.target.value })
                            }
                            className={`w-full px-2.5 py-2 bg-(--bg-card) border rounded-xl text-xs font-mono font-bold text-(--color-text) outline-none transition-colors ${
                              duration.isInvalid
                                ? 'border-rose-500 ring-1 ring-rose-500/30'
                                : 'border-(--border-color) focus:border-blue-500'
                            }`}
                          />
                        </div>
                      )}
                    </div>

                    {/* Inline Duration Feedback & Physical Card Option */}
                    <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-(--border-color)/60">
                      <div>
                        {row.planType !== 'none' && (
                          <div className="flex items-center gap-1.5 text-[10px]">
                            {duration.isInvalid ? (
                              <span className="inline-flex items-center gap-1 text-rose-500 font-bold font-mono">
                                <AlertTriangle className="w-3 h-3" />
                                {duration.message}
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 text-slate-500 dark:text-slate-400 font-mono font-semibold">
                                Duration: <strong className="text-emerald-600 dark:text-emerald-400">{duration.days} days</strong>
                                {row.planType === 'monthly' && ' (1 Month limit)'}
                                {row.planType === 'yearly' && ' (1 Year limit)'}
                              </span>
                            )}
                          </div>
                        )}
                      </div>

                      <div className="flex items-center gap-3">
                        <label className="flex items-center gap-1.5 cursor-pointer select-none">
                          <input
                            type="checkbox"
                            checked={row.issueCard}
                            disabled={isMigrating}
                            onChange={(e) =>
                              updateRow(row.tempId, {
                                issueCard: e.target.checked,
                              })
                            }
                            className="w-3.5 h-3.5 rounded text-blue-600 accent-blue-600 cursor-pointer"
                          />
                          <span className="text-[11px] font-bold text-slate-600 dark:text-slate-300">
                            Issue Member Card
                          </span>
                        </label>

                        {row.issueCard && (
                          <div className="flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() =>
                                updateRow(row.tempId, { cardType: 'QR' })
                              }
                              className={`px-2 py-0.5 rounded text-[9px] font-bold uppercase border cursor-pointer ${
                                row.cardType === 'QR'
                                  ? 'bg-blue-600 text-white border-blue-500'
                                  : 'bg-(--bg-card) text-slate-400 border-(--border-color)'
                              }`}
                            >
                              QR
                            </button>
                            <button
                              type="button"
                              onClick={() =>
                                updateRow(row.tempId, { cardType: 'Manual' })
                              }
                              className={`px-2 py-0.5 rounded text-[9px] font-bold uppercase border cursor-pointer ${
                                row.cardType === 'Manual'
                                  ? 'bg-blue-600 text-white border-blue-500'
                                  : 'bg-(--bg-card) text-slate-400 border-(--border-color)'
                              }`}
                            >
                              Manual
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* FOOTER */}
            <div className="p-4 border-t border-(--border-color) bg-(--bg-card) flex items-center justify-between gap-3 shrink-0">
              <button
                type="button"
                onClick={onClose}
                disabled={isMigrating}
                className="px-4 py-2 bg-(--bg-input) hover:bg-(--bg-card) text-(--color-text) rounded-xl text-xs font-heading font-bold uppercase tracking-wider cursor-pointer border border-(--border-color) transition-colors disabled:opacity-40"
              >
                Cancel
              </button>

              <button
                type="button"
                onClick={handleRunMigration}
                disabled={isMigrating || rows.length === 0}
                className="px-6 py-2.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white font-heading font-black text-xs uppercase tracking-wider rounded-xl cursor-pointer shadow-lg transition-all flex items-center gap-2"
              >
                {isMigrating ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Migrating {migrationProgress}%...</span>
                  </>
                ) : (
                  <>
                    <Database className="w-4 h-4" />
                    <span>Execute Migration ({rows.length} Members)</span>
                  </>
                )}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>,
    document.body
  );
};