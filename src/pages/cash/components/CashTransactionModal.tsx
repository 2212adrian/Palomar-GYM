import React, { useState, useEffect } from 'react';
import { ArrowDownRight, ArrowUpRight, Smartphone, Check } from 'lucide-react';
import { toast } from 'react-toastify';
import { Modal } from '../../../components/ui/Modal';
import { Button } from '../../../components/ui/Button';
import { recordCashTransaction } from '../../../lib/supabase/cashService';
import { useAuthStore } from '../../../stores/authStore';
import type { CashTransactionType } from '../../../types/cash';

interface CashTransactionModalProps {
  isOpen: boolean;
  onClose: () => void;
  type: CashTransactionType;
  sessionId: string;
  currentDrawerCash?: number;
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

export const CashTransactionModal: React.FC<CashTransactionModalProps> = ({
  isOpen,
  onClose,
  type,
  sessionId,
  currentDrawerCash = 0,
  onSuccess,
}) => {
  const { user, profile } = useAuthStore();
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const numAmount = parseFloat(amount);

    if (!numAmount || numAmount <= 0) {
      toast.error('Please enter an amount greater than zero.');
      return;
    }

    if (type === 'cash_out' && numAmount > currentDrawerCash) {
      const confirmOverdraw = window.confirm(
        `Warning: Amount (₱${numAmount.toFixed(2)}) exceeds current expected drawer cash (₱${currentDrawerCash.toFixed(2)}). Do you want to proceed anyway?`
      );
      if (!confirmOverdraw) return;
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

      await recordCashTransaction({
        sessionId,
        type,
        amount: numAmount,
        reason: reason.trim(),
        referenceNumber: referenceNumber.trim() || undefined,
        performedBy: user?.id || null,
        performedByName: actorName,
      });

      const formattedAmount = `₱${numAmount.toLocaleString('en-US', { minimumFractionDigits: 2 })}`;
      if (type === 'cash_in')
        toast.success(`${formattedAmount} added to drawer.`);
      else if (type === 'cash_out')
        toast.success(`${formattedAmount} deducted from drawer.`);
      else toast.success(`${formattedAmount} logged as digital collection.`);

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
        <div>
          <p className="text-xs font-black uppercase tracking-wider">
            {config.tag}
          </p>
          <p className="text-[11px] text-slate-500 dark:text-slate-400">
            {type === 'cash_out'
              ? `${config.subtitle} (Current in drawer: ₱${currentDrawerCash.toLocaleString('en-US', { minimumFractionDigits: 2 })})`
              : config.subtitle}
          </p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300 mb-1.5">
            Amount (₱) *
          </label>
          <div className="relative">
            <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 font-bold">
              ₱
            </span>
            <input
              type="number"
              step="1"
              min="1"
              autoFocus
              placeholder="0.00"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className={`w-full pl-8 pr-4 py-3 bg-white dark:bg-[#111] border border-slate-200 dark:border-white/10 rounded-xl text-lg font-bold text-slate-900 dark:text-white focus:outline-none focus:ring-2 ${config.ringClass}`}
              required
            />
          </div>
        </div>

        {type === 'digital_in' && (
          <div>
            <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300 mb-1.5">
              Reference / Trace Number
            </label>
            <input
              type="text"
              placeholder="e.g. GCash Ref 9021481923"
              value={referenceNumber}
              onChange={(e) => setReferenceNumber(e.target.value)}
              className="w-full px-3.5 py-2.5 bg-white dark:bg-[#111] border border-slate-200 dark:border-white/10 rounded-xl text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono"
            />
          </div>
        )}

        <div>
          <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300 mb-1.5">
            Reason / Notes *
          </label>
          <textarea
            rows={3}
            placeholder="Details, purpose, or receipt note..."
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            className={`w-full px-3.5 py-2.5 bg-white dark:bg-[#111] border border-slate-200 dark:border-white/10 rounded-xl text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-2 ${config.ringClass} resize-none`}
            required
          />
        </div>

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
            loading={isSubmitting}
            className={`flex-1 py-2.5 text-xs ${config.btnClass}`}
          >
            <Check className="w-4 h-4 mr-1" />
            CONFIRM {type.replace('_', ' ').toUpperCase()}
          </Button>
        </div>
      </form>
    </Modal>
  );
};
