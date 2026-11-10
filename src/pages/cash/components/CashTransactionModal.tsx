import React, { useState, useEffect } from 'react';
import {
  ArrowDownRight,
  ArrowUpRight,
  Smartphone,
  Check,
  AlertTriangle,
  Info,
} from 'lucide-react';
import { toast } from 'react-toastify';
import { Modal } from '../../../components/ui/Modal';
import { Button } from '../../../components/ui/Button';
import { recordCashTransaction } from '../../../lib/supabase/cashService';
import { useAuthStore } from '../../../stores/authStore';
import { isSuperAdmin } from '../../../constants/auth';
import type { CashTransactionType } from '../../../types/cash';

interface CashTransactionModalProps {
  isOpen: boolean;
  onClose: () => void;
  type: CashTransactionType;
  sessionId: string;
  currentDrawerCash?: number | null;
  onSuccess: () => Promise<void> | void;
}

const TYPE_CONFIG = {
  cash_in: {
    title: 'RECORD CASH IN',
    tag: 'Physical Cash Inflow',
    subtitle: 'Deposits physical cash directly into the register drawer.',
    icon: ArrowDownRight,
    btnClass: '!bg-emerald-600 hover:!bg-emerald-700 !text-white',
    ringClass: 'focus:ring-emerald-500',
    headerBg:
      'bg-emerald-500/10 border-emerald-500/20 text-emerald-600 dark:text-emerald-400',
  },
  cash_out: {
    title: 'RECORD CASH OUT',
    tag: 'Physical Cash Outflow',
    subtitle: 'Deducts physical cash directly from the register drawer.',
    icon: ArrowUpRight,
    btnClass: '!bg-rose-600 hover:!bg-rose-700 !text-white',
    ringClass: 'focus:ring-rose-500',
    headerBg:
      'bg-rose-500/10 border-rose-500/20 text-rose-600 dark:text-rose-400',
  },
  digital_in: {
    title: 'RECORD DIGITAL IN',
    tag: 'Electronic / E-Wallet Collection',
    subtitle:
      'Tracked in session collections but kept outside physical drawer balance.',
    icon: Smartphone,
    btnClass: '!bg-blue-600 hover:!bg-blue-700 !text-white',
    ringClass: 'focus:ring-blue-500',
    headerBg:
      'bg-blue-500/10 border-blue-500/20 text-blue-600 dark:text-blue-400',
  },
};

const BYPASS_KEYWORDS = ['membership', 'walk-in', 'walkin', 'pass', 'entrance', 'gym fee', 'plan'];

export const CashTransactionModal: React.FC<CashTransactionModalProps> = ({
  isOpen,
  onClose,
  type,
  sessionId,
  currentDrawerCash = 0,
  onSuccess,
}) => {
  const safeCurrentDrawerCash = Math.max(0, currentDrawerCash ?? 0);
  const { user, profile } = useAuthStore();
  const isAdmin = profile?.role === 'admin' || isSuperAdmin(user?.email);

  const config = TYPE_CONFIG[type];
  const Icon = config.icon;

  const [amount, setAmount] = useState('');
  const [referenceNumber, setReferenceNumber] = useState('');
  const [reason, setReason] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setAmount('');
      setReferenceNumber('');
      setReason('');
    }
  }, [isOpen]);

  const numAmount = parseFloat(amount) || 0;
  const isCashIn = type === 'cash_in';
  const isCashOut = type === 'cash_out';
  const isDigitalIn = type === 'digital_in';
  const exceedsDrawerCash = isCashOut && numAmount > safeCurrentDrawerCash;
  const isDigitalInRefValid = !isDigitalIn || /^\d{13}$/.test(referenceNumber.trim());

  // Complete Anti-Structuring Rule:
  // ALL physical manual drawer movements (Cash In or Cash Out) by non-admin staff
  // require Admin approval. Zero thresholds to game or split.
  const willRequireApproval = !isAdmin && (isCashIn || isCashOut);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!numAmount || numAmount <= 0) {
      toast.error('Please enter an amount greater than zero.');
      return;
    }

    if (exceedsDrawerCash) {
      toast.error(
        `Cannot cash out ₱${numAmount.toFixed(2)}. Current cash in drawer is only ₱${safeCurrentDrawerCash.toFixed(2)}.`
      );
      return;
    }

    // 13-digit validation for Digital In (same as GCash method)
    if (isDigitalIn) {
      const cleanRef = referenceNumber.trim();
      if (!/^\d{13}$/.test(cleanRef)) {
        toast.error('GCash reference number must be exactly 13 digits.');
        return;
      }
    }

    // Anti-bypass guard: Check if staff is attempting to log customer fees via manual Cash In
    if (isCashIn) {
      const lowerReason = reason.toLowerCase();
      const detectedKeyword = BYPASS_KEYWORDS.find((kw) => lowerReason.includes(kw));
      if (detectedKeyword) {
        toast.warning(
          `Notice: Customer payments (${detectedKeyword}) must be registered under Logbook & Plans or Sales so a member pass/receipt is issued. Do not use manual Cash In for customer fees.`,
          { autoClose: 7000 }
        );
      }
    }

    if (!reason.trim()) {
      toast.error('Please provide a reason or note for this transaction.');
      return;
    }

    try {
      setIsSubmitting(true);
      const actorName =
        profile?.username ||
        user?.user_metadata?.full_name ||
        user?.email ||
        'Staff';

      const fullReason = reason.trim().slice(0, 300);

      // Handle pending transactions for staff manual drawer movements
      if (willRequireApproval) {
        await recordCashTransaction({
          sessionId,
          type,
          amount: numAmount,
          reason: fullReason,
          referenceNumber: referenceNumber.trim() || undefined,
          performedBy: user?.id || null,
          performedByName: actorName,
          status: 'pending',
        });

        toast.info(
          `${isCashIn ? 'Cash In' : 'Cash Out'} request for ₱${numAmount.toLocaleString('en-US', { minimumFractionDigits: 2 })} sent to admin for approval.`
        );
        onClose();
        await onSuccess();
        return;
      }

      // Admin actions or Digital In proceed directly
      await recordCashTransaction({
        sessionId,
        type,
        amount: numAmount,
        reason: fullReason,
        referenceNumber: referenceNumber.trim() || undefined,
        performedBy: user?.id || null,
        performedByName: actorName,
        status: 'completed',
      });

      const formattedAmount = `₱${numAmount.toLocaleString('en-US', { minimumFractionDigits: 2 })}`;
      const isOfflineMode = typeof navigator !== 'undefined' && !navigator.onLine;
      const offlineSuffix = isOfflineMode ? ' (Saved offline, will sync when reconnected)' : '';

      if (type === 'cash_in') {
        toast.success(`${formattedAmount} added to drawer.${offlineSuffix}`);
      } else if (type === 'cash_out') {
        toast.success(`${formattedAmount} deducted from drawer.${offlineSuffix}`);
      } else {
        toast.success(`${formattedAmount} logged as digital collection.${offlineSuffix}`);
      }

      onClose();
      await onSuccess();
    } catch (err: any) {
      console.error('Record cash transaction error:', err);
      toast.error(
        err?.message || 'Failed to record cash transaction. Please try again.'
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={config.title}
      className="w-full max-w-md mx-auto my-auto p-6 text-left"
    >
      <div
        className={`flex items-center gap-3 p-3.5 border rounded-2xl mb-4 ${config.headerBg}`}
      >
        <div className="w-10 h-10 rounded-xl bg-current/15 flex items-center justify-center shrink-0">
          <Icon className="w-5 h-5" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-black uppercase tracking-wider">
            {config.tag}
          </p>
          <p className="text-[11px] text-slate-500 dark:text-slate-400">
            {config.subtitle}
          </p>
          {isCashOut && (
            <div className="mt-1 flex items-center justify-between text-[11px] font-mono font-bold">
              <span className="text-slate-500 dark:text-slate-400">Available in drawer:</span>
              <span className="text-slate-900 dark:text-white">
                ₱{safeCurrentDrawerCash.toLocaleString('en-US', { minimumFractionDigits: 2 })}
              </span>
            </div>
          )}
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300">
              Amount (₱) *
            </label>
            {isCashOut && safeCurrentDrawerCash > 0 && (
              <button
                type="button"
                onClick={() => setAmount(safeCurrentDrawerCash.toString())}
                className="text-[10px] font-bold text-rose-600 dark:text-rose-400 hover:underline cursor-pointer"
              >
                Max Drawer Cash
              </button>
            )}
          </div>

          <div className="relative">
            <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 font-bold">
              ₱
            </span>
            <input
              type="text"
              inputMode="decimal"
              pattern="[0-9]*\.?[0-9]*"
              autoFocus
              placeholder="0.00"
              value={amount}
              onChange={(e) => {
                const val = e.target.value.replace(/[^0-9.]/g, '');
                setAmount(val);
              }}
              className={`w-full pl-8 pr-4 py-3 bg-white dark:bg-[#111] border rounded-xl text-lg font-bold text-slate-900 dark:text-white focus:outline-none focus:ring-2 ${
                exceedsDrawerCash
                  ? 'border-rose-500 text-rose-600 focus:ring-rose-500'
                  : `border-slate-200 dark:border-white/10 ${config.ringClass}`
              }`}
              required
            />
          </div>

          {exceedsDrawerCash && (
            <p className="mt-1 text-xs text-rose-600 dark:text-rose-400 font-semibold flex items-center gap-1">
              <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
              Exceeds cash in drawer (₱{safeCurrentDrawerCash.toFixed(2)}). Cannot go negative.
            </p>
          )}

          {willRequireApproval && (
            <p className="mt-1.5 text-[11px] text-amber-600 dark:text-amber-400 flex items-center gap-1">
              <Info className="w-3.5 h-3.5 shrink-0" />
              Manual drawer {isCashIn ? 'cash in' : 'cash out'} will be submitted to the Admin for approval.
            </p>
          )}
        </div>

        {/* 13-Digit GCash / Reference Code Validation for Digital In */}
        {isDigitalIn && (
          <div>
            <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300 mb-1.5">
              GCash Reference Number (13 Digits) *
            </label>
            <input
              type="text"
              inputMode="numeric"
              maxLength={13}
              placeholder="ENTER 13-DIGIT REFERENCE CODE..."
              value={referenceNumber}
              onChange={(e) =>
                setReferenceNumber(e.target.value.replace(/\D/g, '').slice(0, 13))
              }
              className="w-full px-3.5 py-2.5 bg-white dark:bg-[#111] border border-slate-200 dark:border-white/10 rounded-xl text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono font-bold"
              required
            />
            {/^\d{13}$/.test(referenceNumber.trim()) ? (
              <div className="text-[10px] text-emerald-600 dark:text-emerald-400 font-sans mt-1 flex items-center gap-1 font-bold">
                <Check className="w-3 h-3" /> 13-digit GCash reference code validated.
              </div>
            ) : referenceNumber.trim().length > 0 ? (
              <div className="text-[10px] text-amber-500 font-sans mt-1">
                {13 - referenceNumber.trim().length} more digits needed (13 digits required).
              </div>
            ) : null}
          </div>
        )}

        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300">
              Reason / Purpose *
            </label>
            <span className="text-[10px] text-slate-400 font-mono">
              {reason.length}/300
            </span>
          </div>
          <textarea
            rows={2}
            maxLength={300}
            placeholder={
              isCashIn
                ? 'e.g. Small denomination replenishment, returned change from water delivery...'
                : 'e.g. Drinking water refill, cleaning supplies, petty expense...'
            }
            value={reason}
            onChange={(e) => setReason(e.target.value.slice(0, 300))}
            className={`w-full px-3.5 py-2.5 bg-white dark:bg-[#111] border border-slate-200 dark:border-white/10 rounded-xl text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-2 ${config.ringClass} resize-none`}
            required
          />
        </div>

        {/* Anti-Bypass Helper Notice for Cash In */}
        {isCashIn && (
          <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-[#111] border border-slate-200/80 dark:border-white/5 text-[10.5px] text-slate-500 dark:text-slate-400 leading-relaxed flex items-start gap-2">
            <Info className="w-3.5 h-3.5 shrink-0 mt-0.5 text-blue-500" />
            <span>
              <strong>Note:</strong> Customer payments (Memberships, Passes, Drinks) must be processed through <strong>Logbook & Plans</strong> or <strong>Sales</strong> so official access cards & receipts are issued.
            </span>
          </div>
        )}

        <div className="flex gap-2 pt-2">
          <Button
            type="button"
            variant="secondary"
            onClick={onClose}
            disabled={isSubmitting}
            className="flex-1 py-2.5 text-xs"
          >
            Cancel
          </Button>
          <Button
            type="submit"
            variant="primary"
            disabled={exceedsDrawerCash || isSubmitting || !isDigitalInRefValid}
            loading={isSubmitting}
            className={`flex-1 py-2.5 text-xs ${config.btnClass}`}
          >
            <Check className="w-4 h-4 mr-1" />
            {willRequireApproval ? `REQUEST ${type.replace('_', ' ').toUpperCase()}` : `CONFIRM ${type.replace('_', ' ').toUpperCase()}`}
          </Button>
        </div>
      </form>
    </Modal>
  );
};