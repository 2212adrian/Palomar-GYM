import React, { useState } from 'react';
import { Table, type Column } from '../../../components/ui/Table';
import { Modal } from '../../../components/ui/Modal';
import { Button } from '../../../components/ui/Button';
import {
  Edit2,
  Trash2,
  Plus,
  X,
  PackagePlus,
  AlertTriangle,
} from 'lucide-react';
import { toast } from 'react-toastify';
import { supabase } from '../../../lib/supabase/client';
import { logAudit } from '../../../lib/supabase/audit';

export interface SaleItemEntry {
  productName: string;
  quantity: number;
  price: number;
}

interface SalesManagerProps {
  sales: any[];
  loading: boolean;
  isSuperAdmin: boolean;
  onRefresh: () => void;
  onOpenNewModal: () => void;
}

export const SalesManager: React.FC<SalesManagerProps> = ({
  sales,
  loading,
  isSuperAdmin,
  onRefresh,
  onOpenNewModal,
}) => {
  // Modal states
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editingSale, setEditingSale] = useState<any | null>(null);
  const [deleteCandidate, setDeleteCandidate] = useState<any | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Multi-item dynamic form state
  const [items, setItems] = useState<SaleItemEntry[]>([]);
  const [paymentMethod, setPaymentMethod] = useState('Cash');
  const [totalAmount, setTotalAmount] = useState<number>(0);
  const [amountReceived, setAmountReceived] = useState<number>(0);
  const [referenceNo, setReferenceNo] = useState('');

  const calculateSum = (itemList: SaleItemEntry[]) => {
    const sum = itemList.reduce(
      (acc, curr) => acc + Number(curr.price || 0) * Number(curr.quantity || 1),
      0
    );
    setTotalAmount(sum);
    setAmountReceived(sum);
  };

  const handleOpenEditModal = (record: any) => {
    setEditingSale(record);
    const existingItems: SaleItemEntry[] =
      record.parsed_items && record.parsed_items.length > 0
        ? record.parsed_items.map((it: any) => ({
            productName: it.productName || it.product_name || 'Item',
            quantity: Number(it.quantity || 1),
            price: Number(it.price || 0),
          }))
        : [
            {
              productName: record.product_name || '',
              quantity: 1,
              price: Number(record.total_amount || 0),
            },
          ];

    setItems(existingItems);
    setPaymentMethod(record.payment_method || 'Cash');
    setTotalAmount(Number(record.total_amount || 0));
    setAmountReceived(
      Number(record.amount_received || record.total_amount || 0)
    );
    setReferenceNo(record.reference_number || '');
    setEditModalOpen(true);
  };

  const updateItem = (
    index: number,
    field: keyof SaleItemEntry,
    value: any
  ) => {
    const updated = [...items];
    updated[index] = { ...updated[index], [field]: value };
    setItems(updated);
    calculateSum(updated);
  };

  const addItemRow = () => {
    setItems([...items, { productName: '', quantity: 1, price: 0 }]);
  };

  const removeItemRow = (index: number) => {
    if (items.length === 1) {
      toast.warning('A sale transaction must have at least one product.');
      return;
    }
    const updated = items.filter((_, i) => i !== index);
    setItems(updated);
    calculateSum(updated);
  };

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isSuperAdmin) {
      toast.error('SuperAdmin access required.');
      return;
    }

    const cleanItems = items.filter((i) => i.productName.trim() !== '');
    if (cleanItems.length === 0) {
      toast.error('Please enter at least one product name.');
      return;
    }

    const productSummary = cleanItems
      .map((i) => `${i.quantity}x ${i.productName}`)
      .join(', ');

    try {
      const payload = {
        items: cleanItems,
        product_name: productSummary,
        payment_method: paymentMethod,
        total_amount: Number(totalAmount),
        amount_received: Number(amountReceived),
        reference_number: referenceNo.trim() || null,
      };

      const { error } = await supabase
        .from('sales')
        .update(payload)
        .eq('id', editingSale.id);
      if (error) throw error;

      toast.success('Sale updated successfully');
      await logAudit(
        'SUPERADMIN_SALE_EDIT',
        `SuperAdmin updated sale ${editingSale.id}: ${productSummary} (₱${totalAmount})`,
        editingSale.id
      );

      setEditModalOpen(false);
      onRefresh();
    } catch (err: any) {
      toast.error(err.message || 'Failed to update sale transaction');
    }
  };

  // HARD PERMANENT DELETION (Bypasses recycle bin)
  const executePermanentDelete = async () => {
    if (!deleteCandidate || !isSuperAdmin) return;

    setIsDeleting(true);
    try {
      const { error } = await supabase
        .from('sales')
        .delete()
        .eq('id', deleteCandidate.id);

      if (error) throw error;

      toast.success('Sale permanently removed from database.');
      await logAudit(
        'SUPERADMIN_SALE_HARD_DELETE',
        `Permanent HARD DELETE of sale transaction ID ${deleteCandidate.id} (₱${deleteCandidate.total_amount}). Stock not returned, cash session not adjusted.`,
        deleteCandidate.id
      );

      setDeleteCandidate(null);
      onRefresh();
    } catch (err: any) {
      toast.error(err.message || 'Failed to permanently delete sale');
    } finally {
      setIsDeleting(false);
    }
  };

  const columns: Column<any>[] = [
    {
      key: 'searchable_items',
      header: 'Items Sold & Details',
      sortable: true,
      render: (item) => (
        <div className="space-y-1.5 py-1 text-left">
          {item.parsed_items && item.parsed_items.length > 0 ? (
            <div className="space-y-1">
              {item.parsed_items.map((it: any, idx: number) => (
                <div key={idx} className="flex items-center gap-2 text-xs">
                  <span className="font-mono font-black text-blue-600 dark:text-red-400">
                    {it.quantity}x
                  </span>
                  <span className="font-semibold text-slate-800 dark:text-slate-200">
                    {it.productName}
                  </span>
                  {Number(it.price) > 0 && (
                    <span className="text-[10px] font-mono text-slate-400">
                      (₱{Number(it.price).toFixed(2)})
                    </span>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <span className="font-bold text-slate-900 dark:text-white text-xs block">
              {item.product_name || 'Sale Transaction'}
            </span>
          )}

          <div className="flex items-center gap-1.5 flex-wrap pt-0.5">
            <span
              className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold uppercase border ${
                item.payment_method === 'GCash'
                  ? 'bg-sky-500/10 text-sky-600 dark:text-sky-400 border-sky-500/20'
                  : 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20'
              }`}
            >
              {item.payment_method || 'Cash'}
            </span>
            {item.receipt_no && (
              <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-slate-100 dark:bg-neutral-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-white/10">
                {item.receipt_no}
              </span>
            )}
            {item.reference_number && (
              <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-slate-100 dark:bg-neutral-800 text-slate-500 dark:text-slate-400 border border-slate-200 dark:border-white/10">
                Ref: {item.reference_number}
              </span>
            )}
          </div>
        </div>
      ),
    },
    {
      key: 'total_amount',
      header: 'Total Amount',
      sortable: true,
      render: (item) => (
        <div className="py-1 text-left">
          <span className="font-mono font-black text-slate-900 dark:text-white text-xs sm:text-sm block">
            ₱{Number(item.total_amount || 0).toFixed(2)}
          </span>
          <span className="text-[10px] font-mono text-slate-400">
            Rcvd: ₱
            {Number(item.amount_received || item.total_amount || 0).toFixed(2)}
          </span>
        </div>
      ),
    },
    {
      key: 'created_at',
      header: 'Recorded Time (PHT)',
      sortable: true,
      render: (item) => (
        <span className="text-[11px] font-mono text-slate-500 dark:text-slate-400 whitespace-nowrap">
          {item.created_at
            ? new Date(item.created_at).toLocaleString('en-US', {
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
            onClick={() => handleOpenEditModal(item)}
            className="p-1.5 rounded-lg border border-slate-200 dark:border-white/10 hover:bg-slate-100 dark:hover:bg-neutral-800 text-blue-600 dark:text-blue-400 cursor-pointer"
            title="Edit Multi-Product Sale"
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
          Managing Store &amp; Merchandise Sales ({sales.length} loaded)
        </span>
        <button
          type="button"
          onClick={onOpenNewModal}
          className="py-1.5 px-3 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-heading font-bold text-xs uppercase tracking-wider flex items-center gap-1.5 cursor-pointer shadow-xs"
        >
          <Plus className="w-3.5 h-3.5" />
          <span>New Sale</span>
        </button>
      </div>

      <Table
        data={sales}
        columns={columns}
        searchKeys={['searchable_items', 'payment_method', 'reference_number']}
        searchPlaceholder="Search product names, receipt number, payment method..."
        loading={loading}
        itemsPerPage={10}
      />

      {/* ─── MULTI-ITEM EDIT MODAL ─── */}
      <Modal
        isOpen={editModalOpen}
        onClose={() => setEditModalOpen(false)}
        title="Edit Multi-Product Sale"
        className="max-w-xl w-full p-5"
      >
        <form onSubmit={handleSaveEdit} className="space-y-4 text-xs text-left">
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="font-heading font-bold uppercase text-[11px] text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                <PackagePlus className="w-4 h-4 text-blue-600 dark:text-red-400" />
                <span>Products in this transaction</span>
              </label>
              <button
                type="button"
                onClick={addItemRow}
                className="px-2 py-1 rounded-lg bg-blue-500/10 hover:bg-blue-500/20 text-blue-600 dark:text-blue-400 font-bold text-[10px] flex items-center gap-1 cursor-pointer"
              >
                <Plus className="w-3 h-3" />
                <span>Add Product</span>
              </button>
            </div>

            <div className="space-y-2 max-h-52 overflow-y-auto pr-1">
              {items.map((item, idx) => (
                <div
                  key={idx}
                  className="flex items-center gap-2 p-2.5 rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-neutral-800"
                >
                  <div className="flex-1 min-w-[120px]">
                    <span className="text-[9px] uppercase font-bold text-slate-400 block mb-0.5">
                      Product
                    </span>
                    <input
                      type="text"
                      required
                      placeholder="e.g. Whey Scoop"
                      value={item.productName}
                      onChange={(e) =>
                        updateItem(idx, 'productName', e.target.value)
                      }
                      className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-neutral-900 text-slate-900 dark:text-white"
                    />
                  </div>

                  <div className="w-20">
                    <span className="text-[9px] uppercase font-bold text-slate-400 block mb-0.5">
                      Qty
                    </span>
                    <input
                      type="number"
                      min="1"
                      required
                      value={item.quantity}
                      onChange={(e) =>
                        updateItem(
                          idx,
                          'quantity',
                          Math.max(1, Number(e.target.value))
                        )
                      }
                      className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-neutral-900 text-slate-900 dark:text-white font-mono text-center"
                    />
                  </div>

                  <div className="w-24">
                    <span className="text-[9px] uppercase font-bold text-slate-400 block mb-0.5">
                      Price (₱)
                    </span>
                    <input
                      type="number"
                      min="0"
                      step="any"
                      required
                      value={item.price}
                      onChange={(e) =>
                        updateItem(idx, 'price', Number(e.target.value))
                      }
                      className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-neutral-900 text-slate-900 dark:text-white font-mono text-right"
                    />
                  </div>

                  <button
                    type="button"
                    onClick={() => removeItemRow(idx)}
                    className="p-1 mt-3.5 text-slate-400 hover:text-red-500 cursor-pointer"
                    title="Remove item"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                Payment Method
              </label>
              <select
                value={paymentMethod}
                onChange={(e) => setPaymentMethod(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-neutral-800 text-slate-900 dark:text-white"
              >
                <option value="Cash">Cash</option>
                <option value="GCash">GCash</option>
              </select>
            </div>

            <div>
              <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                Total Amount (₱)
              </label>
              <input
                type="number"
                min="0"
                step="any"
                required
                value={totalAmount}
                onChange={(e) => setTotalAmount(Number(e.target.value))}
                className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-neutral-800 text-slate-900 dark:text-white font-mono"
              />
            </div>

            <div>
              <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                Amount Received (₱)
              </label>
              <input
                type="number"
                min="0"
                step="any"
                value={amountReceived}
                onChange={(e) => setAmountReceived(Number(e.target.value))}
                className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-neutral-800 text-slate-900 dark:text-white font-mono"
              />
            </div>
          </div>

          <div>
            <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
              GCash / POS Reference Number
            </label>
            <input
              type="text"
              value={referenceNo}
              onChange={(e) => setReferenceNo(e.target.value)}
              placeholder="e.g. 25357342"
              className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-neutral-800 text-slate-900 dark:text-white font-mono"
            />
          </div>

          <div className="flex justify-end gap-2 pt-3 border-t border-slate-100 dark:border-white/10">
            <Button
              type="button"
              variant="secondary"
              onClick={() => setEditModalOpen(false)}
            >
              Cancel
            </Button>
            <Button type="submit" variant="primary">
              Save Changes
            </Button>
          </div>
        </form>
      </Modal>

      {/* ─── STYLED CONFIRM PERMANENT DELETION MODAL (IDENTICAL TO ATTENDANCE) ─── */}
      <Modal
        isOpen={!!deleteCandidate}
        onClose={() => !isDeleting && setDeleteCandidate(null)}
        title="CONFIRM PERMANENT DELETION"
        className="max-w-md w-full p-6 text-left"
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
                  Product inventory stock will <strong>NOT</strong> be returned
                  or restocked.
                </li>
                <li>
                  Cash Management and revenue balances will <strong>NOT</strong>{' '}
                  be automatically adjusted.
                </li>
              </ul>
            </div>

            <div className="p-3.5 rounded-xl bg-slate-100 dark:bg-neutral-800 text-slate-800 dark:text-slate-200 space-y-1.5 font-mono text-[11px]">
              <div>
                <strong>Receipt / ID:</strong>{' '}
                {deleteCandidate.receipt_no || deleteCandidate.id}
              </div>
              <div>
                <strong>Items:</strong> {deleteCandidate.product_name}
              </div>
              <div>
                <strong>Amount:</strong> ₱
                {Number(deleteCandidate.total_amount || 0).toFixed(2)} (
                {deleteCandidate.payment_method})
              </div>
              <div className="text-[10px] text-slate-400">
                <strong>Timestamp:</strong> {deleteCandidate.created_at}
              </div>
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-100 dark:border-white/10">
              <button
                type="button"
                disabled={isDeleting}
                onClick={() => setDeleteCandidate(null)}
                className="px-4 py-2 rounded-xl border border-slate-200 dark:border-white/10 text-slate-700 dark:text-slate-300 font-bold hover:bg-slate-100 dark:hover:bg-neutral-800 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isDeleting}
                onClick={executePermanentDelete}
                className="px-4 py-2 rounded-xl bg-red-600 hover:bg-red-700 text-white font-bold flex items-center gap-1.5 shadow-sm cursor-pointer disabled:opacity-50"
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
