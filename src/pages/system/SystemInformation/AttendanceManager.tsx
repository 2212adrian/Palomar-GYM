import React, { useState } from 'react';
import { Table, type Column } from '../../../components/ui/Table';
import { Modal } from '../../../components/ui/Modal';
import { Button } from '../../../components/ui/Button';
import {
  Edit2,
  Trash2,
  AlertTriangle,
  CreditCard,
  GraduationCap,
  Ticket,
} from 'lucide-react';
import { toast } from 'react-toastify';
import { supabase } from '../../../lib/supabase/client';
import { logAudit } from '../../../lib/supabase/audit';

interface AttendanceManagerProps {
  attendanceList: any[];
  loading: boolean;
  isSuperAdmin: boolean;
  onRefresh: () => void;
  onOpenNewModal: () => void;
}

export const AttendanceManager: React.FC<AttendanceManagerProps> = ({
  attendanceList,
  loading,
  isSuperAdmin,
  onRefresh,
  onOpenNewModal,
}) => {
  // Modal states
  const [modalOpen, setModalOpen] = useState(false);
  const [editingAtt, setEditingAtt] = useState<any | null>(null);
  const [deleteCandidate, setDeleteCandidate] = useState<any | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Form State
  const [form, setForm] = useState({
    customer_name: '',
    customer_type: 'Walk-In',
    plan_name: 'Daily Pass',
    payment_method: 'Cash',
    entry_fee: 60,
    payment_status: 'Paid',
    is_batch_card: false,
    batch_cards: ['', '', '', ''],
  });

  const handleOpenModal = (record?: any) => {
    if (record) {
      setEditingAtt(record);
      const isCard =
        record.customer_type === 'Card' ||
        String(record.plan_name || '')
          .toLowerCase()
          .includes('card');

      const existingCards = Array.isArray(record.member_ids)
        ? [...record.member_ids]
        : [];
      while (existingCards.length < 4) existingCards.push('');

      setForm({
        customer_name: record.customer_name || '',
        customer_type: record.customer_type || 'Walk-In',
        plan_name: record.plan_name || 'Daily Pass',
        payment_method: record.payment_method || 'Cash',
        entry_fee: Number(record.entry_fee || 0),
        payment_status: record.payment_status || 'Paid',
        is_batch_card: isCard,
        batch_cards: existingCards.slice(0, 4),
      });
    } else {
      setEditingAtt(null);
      setForm({
        customer_name: '',
        customer_type: 'Walk-In',
        plan_name: 'Regular Daily Pass',
        payment_method: 'Cash',
        entry_fee: 60,
        payment_status: 'Paid',
        is_batch_card: false,
        batch_cards: ['', '', '', ''],
      });
    }
    setModalOpen(true);
  };

  const handleBatchCardChange = (index: number, value: string) => {
    const updated = [...form.batch_cards];
    updated[index] = value.toUpperCase().trim();
    setForm({ ...form, batch_cards: updated });
  };

  const handlePassTypeSelect = (type: 'regular' | 'student') => {
    if (type === 'regular') {
      setForm((prev) => ({
        ...prev,
        customer_type: 'Walk-In',
        plan_name: 'Regular Daily Pass',
        entry_fee: 60,
      }));
    } else {
      setForm((prev) => ({
        ...prev,
        customer_type: 'Walk-In',
        plan_name: 'Student Daily Pass',
        entry_fee: 50,
      }));
    }
  };

  const handleSaveAttendance = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isSuperAdmin) {
      toast.error('SuperAdmin access required.');
      return;
    }

    if (!form.customer_name.trim()) {
      toast.error('Customer or account name is required');
      return;
    }

    try {
      const cleanCards = form.batch_cards.filter((c) => c.trim() !== '');

      const payload: any = {
        customer_name: form.customer_name.trim(),
        customer_type: form.is_batch_card ? 'Card' : form.customer_type,
        plan_name: form.is_batch_card
          ? 'Physical Cards (4 Pcs Batch)'
          : form.plan_name,
        payment_method: form.payment_method,
        entry_fee: Number(form.entry_fee),
        payment_status: form.payment_status,
        updated_at: new Date().toISOString(),
      };

      if (form.is_batch_card) {
        payload.member_ids = cleanCards;
      }

      if (editingAtt) {
        const { error } = await supabase
          .from('attendance')
          .update(payload)
          .eq('id', editingAtt.id);

        if (error) throw error;
        toast.success('Attendance record modified');
        await logAudit(
          'SUPERADMIN_ATTENDANCE_EDIT',
          `SuperAdmin edited attendance "${form.customer_name}" (₱${form.entry_fee}, ${form.plan_name})`,
          editingAtt.id
        );
      } else {
        const { error } = await supabase.from('attendance').insert([
          {
            ...payload,
            check_in_time: new Date().toISOString(),
          },
        ]);

        if (error) throw error;
        toast.success('New check-in registered');
        await logAudit(
          'SUPERADMIN_ATTENDANCE_CREATE',
          `SuperAdmin created check-in: "${form.customer_name}" (₱${form.entry_fee})`
        );
      }

      setModalOpen(false);
      onRefresh();
    } catch (err: any) {
      toast.error(err.message || 'Failed to save attendance record');
    }
  };

  // HARD PERMANENT DELETION
  const executePermanentDelete = async () => {
    if (!deleteCandidate || !isSuperAdmin) return;

    setIsDeleting(true);
    try {
      const { error } = await supabase
        .from('attendance')
        .delete()
        .eq('id', deleteCandidate.id);

      if (error) throw error;

      toast.success('Record permanently removed from database.');
      await logAudit(
        'SUPERADMIN_ATTENDANCE_HARD_DELETE',
        `Permanent HARD DELETE of attendance log "${deleteCandidate.customer_name}" (ID: ${deleteCandidate.id}, ₱${deleteCandidate.entry_fee}).`,
        deleteCandidate.id
      );

      setDeleteCandidate(null);
      onRefresh();
    } catch (err: any) {
      toast.error(err.message || 'Failed to permanently delete record.');
    } finally {
      setIsDeleting(false);
    }
  };

  const attendanceColumns: Column<any>[] = [
    {
      key: 'customer_name',
      header: 'Customer & Pass Details',
      sortable: true,
      render: (item) => {
        const isCard =
          item.customer_type === 'Card' ||
          String(item.plan_name || '')
            .toLowerCase()
            .includes('card');
        const cards: string[] = Array.isArray(item.member_ids)
          ? item.member_ids
          : [];

        return (
          <div className="space-y-1.5 py-1 text-left">
            <span className="font-bold text-slate-900 dark:text-white text-xs sm:text-sm block">
              {item.customer_name}
            </span>
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="px-2 py-0.5 rounded text-[10px] font-mono font-medium bg-slate-100 dark:bg-neutral-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-white/10">
                {item.customer_type || 'Walk-In'}
              </span>
              <span className="px-2 py-0.5 rounded text-[10px] font-heading font-bold uppercase tracking-wider bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20">
                {item.plan_name || 'Daily Pass'}
              </span>
              <span
                className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold uppercase border ${
                  item.payment_method === 'GCash'
                    ? 'bg-sky-500/10 text-sky-600 dark:text-sky-400 border-sky-500/20'
                    : 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20'
                }`}
              >
                {item.payment_method || 'Cash'}
              </span>
            </div>

            {/* Batch Cards Preview Indicator */}
            {isCard && cards.length > 0 && (
              <div className="flex items-center gap-1 flex-wrap pt-0.5">
                <span className="text-[9px] font-bold uppercase text-slate-400 flex items-center gap-1">
                  <CreditCard className="w-3 h-3 text-amber-500" />
                  Cards:
                </span>
                {cards.map((c, i) => (
                  <span
                    key={i}
                    className="px-1.5 py-0.2 rounded bg-amber-500/10 border border-amber-500/20 text-amber-600 dark:text-amber-400 font-mono text-[9px] font-bold"
                  >
                    {c}
                  </span>
                ))}
              </div>
            )}
          </div>
        );
      },
    },
    {
      key: 'entry_fee',
      header: 'Fee & Payment Status',
      sortable: true,
      render: (item) => (
        <div className="space-y-1 py-1 text-left">
          <div className="font-mono font-black text-slate-900 dark:text-white text-xs sm:text-sm">
            ₱{Number(item.entry_fee || 0).toFixed(2)}
          </div>
          <span
            className={`inline-flex items-center px-2 py-0.5 rounded-full text-[9px] font-mono font-bold uppercase border ${
              item.payment_status === 'Paid'
                ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20'
                : 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20'
            }`}
          >
            {item.payment_status || 'Paid'}
          </span>
        </div>
      ),
    },
    {
      key: 'check_in_time',
      header: 'Check-in Time',
      sortable: true,
      render: (item) => (
        <span className="text-[11px] font-mono text-slate-500 dark:text-slate-400 whitespace-nowrap">
          {item.check_in_time
            ? new Date(item.check_in_time).toLocaleString('en-US', {
                timeZone: 'Asia/Manila',
                month: 'short',
                day: 'numeric',
                year: 'numeric',
                hour: 'numeric',
                minute: '2-digit',
                hour12: true,
              })
            : '—'}
        </span>
      ),
    },
    {
      key: 'actions',
      header: 'Actions',
      render: (item) => (
        <div className="flex items-center gap-1.5 justify-end">
          <button
            type="button"
            onClick={() => handleOpenModal(item)}
            className="p-1.5 rounded-lg border border-slate-200 dark:border-white/10 hover:bg-slate-100 dark:hover:bg-neutral-800 text-blue-600 dark:text-blue-400 cursor-pointer"
            title="Edit Attendance"
          >
            <Edit2 className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => setDeleteCandidate(item)}
            className="p-1.5 rounded-lg border border-slate-200 dark:border-white/10 hover:bg-red-50 dark:hover:bg-red-950/40 text-red-600 dark:text-red-400 cursor-pointer"
            title="Hard Delete Permanently"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-xs text-slate-500 dark:text-slate-400">
          Managing Logbook Attendance Entries ({attendanceList.length} loaded)
        </span>
        <button
          type="button"
          onClick={onOpenNewModal}
          className="py-1.5 px-3 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-heading font-bold text-xs uppercase tracking-wider flex items-center gap-1.5 cursor-pointer shadow-xs"
        >
          <span>New Check-in</span>
        </button>
      </div>

      <Table
        data={attendanceList}
        columns={attendanceColumns}
        searchKeys={[
          'customer_name',
          'customer_type',
          'plan_name',
          'payment_method',
          'payment_status',
        ]}
        searchPlaceholder="Search customer, pass, payment method..."
        loading={loading}
        itemsPerPage={10}
      />

      {/* ─── ATTENDANCE & BATCH CARDS EDIT MODAL ─── */}
      <Modal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editingAtt ? 'Edit Attendance Entry' : 'Manual Attendance Entry'}
        className="max-w-lg w-full p-5"
      >
        <form
          onSubmit={handleSaveAttendance}
          className="space-y-4 text-xs text-left"
        >
          {/* Option Selector: Regular / Student or Batch Card Mode */}
          <div className="p-3 bg-slate-50 dark:bg-neutral-800/80 rounded-xl border border-slate-200 dark:border-white/10 space-y-2.5">
            <span className="text-[10px] font-heading font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 block">
              Quick Pass Presets &amp; Card Type
            </span>
            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => {
                  setForm((f) => ({ ...f, is_batch_card: false }));
                  handlePassTypeSelect('regular');
                }}
                className={`p-2 rounded-lg border text-center transition-all cursor-pointer ${
                  !form.is_batch_card &&
                  form.plan_name.toLowerCase().includes('regular')
                    ? 'bg-blue-600 text-white border-blue-600'
                    : 'bg-white dark:bg-neutral-900 border-slate-200 dark:border-white/10 text-slate-700 dark:text-slate-300'
                }`}
              >
                <Ticket className="w-4 h-4 mx-auto mb-1" />
                <span className="font-bold text-[10px] block uppercase">
                  Regular Pass
                </span>
                <span className="text-[9px] font-mono">₱60.00</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setForm((f) => ({ ...f, is_batch_card: false }));
                  handlePassTypeSelect('student');
                }}
                className={`p-2 rounded-lg border text-center transition-all cursor-pointer ${
                  !form.is_batch_card &&
                  form.plan_name.toLowerCase().includes('student')
                    ? 'bg-blue-600 text-white border-blue-600'
                    : 'bg-white dark:bg-neutral-900 border-slate-200 dark:border-white/10 text-slate-700 dark:text-slate-300'
                }`}
              >
                <GraduationCap className="w-4 h-4 mx-auto mb-1" />
                <span className="font-bold text-[10px] block uppercase">
                  Student Pass
                </span>
                <span className="text-[9px] font-mono">₱50.00</span>
              </button>

              <button
                type="button"
                onClick={() =>
                  setForm((f) => ({
                    ...f,
                    is_batch_card: true,
                    customer_type: 'Card',
                    plan_name: 'Physical Cards (4 Pcs Batch)',
                    entry_fee: 400,
                  }))
                }
                className={`p-2 rounded-lg border text-center transition-all cursor-pointer ${
                  form.is_batch_card
                    ? 'bg-amber-600 text-white border-amber-600'
                    : 'bg-white dark:bg-neutral-900 border-slate-200 dark:border-white/10 text-slate-700 dark:text-slate-300'
                }`}
              >
                <CreditCard className="w-4 h-4 mx-auto mb-1" />
                <span className="font-bold text-[10px] block uppercase">
                  Cards (4 Pcs)
                </span>
                <span className="text-[9px] font-mono">₱400.00</span>
              </button>
            </div>
          </div>

          <div>
            <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
              Customer / Member Name
            </label>
            <input
              type="text"
              required
              value={form.customer_name}
              onChange={(e) =>
                setForm({ ...form, customer_name: e.target.value })
              }
              className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-neutral-800 text-slate-900 dark:text-white"
              placeholder="e.g. John Doe"
            />
          </div>

          {/* Flexible Batch Physical Cards (4 Pcs) Editor */}
          {form.is_batch_card && (
            <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-xl space-y-2">
              <label className="block font-bold text-amber-700 dark:text-amber-400 uppercase text-[10px]">
                Physical Cards Number Allocation (Up to 4 pcs)
              </label>
              <div className="grid grid-cols-2 gap-2">
                {form.batch_cards.map((card, idx) => (
                  <div key={idx} className="space-y-0.5">
                    <span className="text-[9px] font-mono font-bold text-slate-400">
                      Card #{idx + 1}
                    </span>
                    <input
                      type="text"
                      value={card}
                      onChange={(e) =>
                        handleBatchCardChange(idx, e.target.value)
                      }
                      placeholder={`CARD-${idx + 1}`}
                      className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-neutral-900 text-slate-900 dark:text-white font-mono text-xs uppercase"
                    />
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                Customer Type
              </label>
              <select
                disabled={form.is_batch_card}
                value={form.customer_type}
                onChange={(e) =>
                  setForm({ ...form, customer_type: e.target.value })
                }
                className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-neutral-800 text-slate-900 dark:text-white disabled:opacity-50"
              >
                <option value="Walk-In">Walk-In</option>
                <option value="Existing Member">Existing Member</option>
                <option value="New Membership">New Membership</option>
                <option value="Card">Card</option>
              </select>
            </div>

            <div>
              <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                Plan / Pass Name
              </label>
              <input
                type="text"
                value={form.plan_name}
                onChange={(e) =>
                  setForm({ ...form, plan_name: e.target.value })
                }
                className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-neutral-800 text-slate-900 dark:text-white"
              />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                Payment Method
              </label>
              <select
                value={form.payment_method}
                onChange={(e) =>
                  setForm({ ...form, payment_method: e.target.value })
                }
                className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-neutral-800 text-slate-900 dark:text-white"
              >
                <option value="Cash">Cash</option>
                <option value="GCash">GCash</option>
              </select>
            </div>

            <div>
              <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                Entry Fee (₱)
              </label>
              <input
                type="number"
                min="0"
                step="any"
                value={form.entry_fee}
                onChange={(e) =>
                  setForm({ ...form, entry_fee: Number(e.target.value) })
                }
                className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-neutral-800 text-slate-900 dark:text-white font-mono"
              />
            </div>

            <div>
              <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                Status
              </label>
              <select
                value={form.payment_status}
                onChange={(e) =>
                  setForm({ ...form, payment_status: e.target.value })
                }
                className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-neutral-800 text-slate-900 dark:text-white"
              >
                <option value="Paid">Paid</option>
                <option value="Unpaid">Unpaid</option>
                <option value="Promo">Promo</option>
              </select>
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-3 border-t border-slate-100 dark:border-white/10">
            <Button
              type="button"
              variant="secondary"
              onClick={() => setModalOpen(false)}
            >
              Cancel
            </Button>
            <Button type="submit" variant="primary">
              Save Record
            </Button>
          </div>
        </form>
      </Modal>

      {/* ─── PERMANENT HARD DELETE WARNING MODAL ─── */}
      <Modal
        isOpen={!!deleteCandidate}
        onClose={() => !isDeleting && setDeleteCandidate(null)}
        title="Confirm Permanent Deletion"
        className="max-w-md w-full p-5 text-left"
      >
        {deleteCandidate && (
          <div className="space-y-4 text-xs">
            <div className="p-3.5 rounded-xl bg-red-500/10 border border-red-500/20 text-red-700 dark:text-red-400 space-y-2">
              <div className="flex items-center gap-2 font-bold uppercase tracking-wider text-xs">
                <AlertTriangle className="w-4 h-4 text-red-500 shrink-0" />
                <span>PERMANENT HARD DELETE WARNING</span>
              </div>
              <p className="text-[11px] leading-relaxed">
                This will <strong>PERMANENTLY ERASE</strong> this record from
                the database.
              </p>
              <ul className="text-[10px] space-y-1 list-disc pl-4 font-semibold">
                <li>This item CANNOT be restored from the Recycle Bin.</li>
                <li>
                  Cash Management and revenue balances will NOT be automatically
                  adjusted.
                </li>
                <li>Any associated cards or audit links will be severed.</li>
              </ul>
            </div>

            <div className="p-3 rounded-xl bg-slate-100 dark:bg-neutral-800 text-slate-800 dark:text-slate-200 space-y-1 font-mono text-[11px]">
              <div>
                Target: <strong>{deleteCandidate.customer_name}</strong>
              </div>
              <div>
                Pass: {deleteCandidate.plan_name} (₱{deleteCandidate.entry_fee})
              </div>
              <div>Timestamp: {deleteCandidate.check_in_time}</div>
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-slate-100 dark:border-white/10">
              <button
                type="button"
                disabled={isDeleting}
                onClick={() => setDeleteCandidate(null)}
                className="px-4 py-2 rounded-xl border border-slate-200 dark:border-white/10 text-slate-700 dark:text-slate-300 font-bold"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isDeleting}
                onClick={executePermanentDelete}
                className="px-4 py-2 rounded-xl bg-red-600 hover:bg-red-700 text-white font-bold flex items-center gap-1.5 shadow-sm"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>{isDeleting ? 'Deleting...' : 'Permanent Delete'}</span>
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
};
