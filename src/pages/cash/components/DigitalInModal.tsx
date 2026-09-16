// src/pages/cash/components/DigitalInModal.tsx
import React, { useState } from 'react';
import { Smartphone, Check } from 'lucide-react';
import { toast } from 'react-toastify';
import { Modal } from '../../../components/ui/Modal';
import { Button } from '../../../components/ui/Button';
import { recordCashTransaction } from '../../../lib/supabase/cashService';
import { useAuthStore } from '../../../stores/authStore';

interface DigitalInModalProps {
  isOpen: boolean;
  onClose: () => void;
  sessionId: string;
  onSuccess: () => Promise<void> | void;
}

const PRESET_CATEGORIES = [
  'GCash Direct Transfer',
  'Maya Direct Transfer',
  'Bank Transfer',
  'Manual Digital Top-Up',
  'Other',
];

export const DigitalInModal: React.FC<DigitalInModalProps> = ({
  isOpen,
  onClose,
  sessionId,
  onSuccess,
}) => {
  const { user, profile } = useAuthStore();
  const [amount, setAmount] = useState('');
  const [category, setCategory] = useState('GCash Direct Transfer');
  const [customCategory, setCustomCategory] = useState('');
  const [referenceNumber, setReferenceNumber] = useState('');
  const [reason, setReason] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const numAmount = parseFloat(amount);
    if (!numAmount || numAmount <= 0) {
      toast.error('Please enter a valid amount greater than zero.');
      return;
    }

    const finalCategory =
      category === 'Other' ? customCategory.trim() || 'Other Digital In' : category;

    if (!reason.trim()) {
      toast.error('Please provide a reason or note for this digital payment.');
      return;
    }

    try {
      setIsSubmitting(true);
      const actorName =
        profile?.username || user?.user_metadata?.full_name || user?.email || 'Staff';

      await recordCashTransaction({
        sessionId,
        type: 'digital_in',
        category: finalCategory,
        amount: numAmount,
        reason: reason.trim(),
        referenceNumber: referenceNumber.trim() || undefined,
        performedBy: user?.id || null,
        performedByName: actorName,
      });

      toast.success(`₱${numAmount.toLocaleString('en-US', { minimumFractionDigits: 2 })} logged under digital collections.`);
      setAmount('');
      setCategory('GCash Direct Transfer');
      setCustomCategory('');
      setReferenceNumber('');
      setReason('');
      await onSuccess();
      onClose();
    } catch (err: any) {
      toast.error(err?.message || 'Failed to record digital payment.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="RECORD DIGITAL IN"
      className="max-w-md p-6 text-left"
    >
      <div className="flex items-center gap-3 p-3.5 bg-blue-500/10 border border-blue-500/20 rounded-2xl mb-4">
        <div className="w-10 h-10 rounded-xl bg-blue-500/20 flex items-center justify-center text-blue-500 shrink-0">
          <Smartphone className="w-5 h-5" />
        </div>
        <div>
          <p className="text-xs font-black uppercase text-blue-600 dark:text-blue-400">Electronic / E-Wallet Collection</p>
          <p className="text-[11px] text-slate-500 dark:text-slate-400">
            Tracked in daily collections but excluded from physical drawer balance.
          </p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300 mb-1.5">
            Digital Amount (₱) *
          </label>
          <div className="relative">
            <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 font-bold">₱</span>
            <input
              type="number"
              step="0.25"
              min="0.25"
              autoFocus
              placeholder="0.00"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="w-full pl-8 pr-4 py-3 bg-white dark:bg-[#111] border border-slate-200 dark:border-white/10 rounded-xl text-lg font-bold text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              required
            />
          </div>
        </div>

        <div>
          <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300 mb-1.5">
            Channel / Category
          </label>
          <div className="flex flex-wrap gap-1.5">
            {PRESET_CATEGORIES.map((cat) => (
              <button
                type="button"
                key={cat}
                onClick={() => setCategory(cat)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                  category === cat
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'bg-slate-100 dark:bg-neutral-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-neutral-700'
                }`}
              >
                {cat}
              </button>
            ))}
          </div>
          {category === 'Other' && (
            <input
              type="text"
              placeholder="Specify channel..."
              value={customCategory}
              onChange={(e) => setCustomCategory(e.target.value)}
              className="mt-2 w-full px-3.5 py-2 bg-white dark:bg-[#111] border border-slate-200 dark:border-white/10 rounded-xl text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              required
            />
          )}
        </div>

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

        <div>
          <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300 mb-1.5">
            Reason / Notes *
          </label>
          <textarea
            rows={2}
            placeholder="e.g. Direct bank transfer for personal training, GCash scan payment..."
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            className="w-full px-3.5 py-2.5 bg-white dark:bg-[#111] border border-slate-200 dark:border-white/10 rounded-xl text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
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
            className="flex-1 py-2.5 text-xs !bg-blue-600 hover:!bg-blue-700 !text-white"
          >
            <Check className="w-4 h-4 mr-1" />
            CONFIRM DIGITAL IN
          </Button>
        </div>
      </form>
    </Modal>
  );
};
