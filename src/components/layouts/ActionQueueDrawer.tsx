// src/components/layouts/ActionQueueDrawer.tsx
import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  X,
  RotateCcw,
  CloudOff,
  Cloud,
  CheckCircle2,
  AlertTriangle,
  Trash2,
  UserPlus,
  UserCheck,
  CreditCard,
  ShoppingCart,
  Calendar,
  AlertCircle,
  Clock,
  Layers,
  Package,
  Banknote,
} from 'lucide-react';
import { useActionQueueStore } from '../../stores/useActionQueueStore';
import { format } from 'date-fns';
import { triggerHapticButton } from '../../lib/hapticsService';

export const ActionQueueDrawer: React.FC = () => {
  const {
    isDrawerOpen,
    closeDrawer,
    queueItems,
    queueCount,
    isLoading,
    isSyncing,
    removeItem,
    triggerManualSync,
    initListeners,
  } = useActionQueueStore();

  const [isOnline, setIsOnline] = useState(
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );

  useEffect(() => {
    const unsub = initListeners();
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      unsub();
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [initListeners]);

  // Handle Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isDrawerOpen) {
        closeDrawer();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isDrawerOpen, closeDrawer]);

  if (!isDrawerOpen) return null;

  const getActionIcon = (type: string) => {
    switch (type) {
      case 'member_create':
        return <UserPlus className="w-4 h-4 text-blue-500" />;
      case 'member_update':
        return <UserCheck className="w-4 h-4 text-sky-500" />;
      case 'member_delete':
      case 'member_soft_delete':
        return <Trash2 className="w-4 h-4 text-rose-500" />;
      case 'member_restore':
        return <RotateCcw className="w-4 h-4 text-blue-500" />;

      case 'attendance':
        return <UserCheck className="w-4 h-4 text-emerald-500" />;
      case 'attendance_delete':
        return <Trash2 className="w-4 h-4 text-rose-500" />;
      case 'attendance_restore':
        return <RotateCcw className="w-4 h-4 text-emerald-500" />;

      case 'card_purchase':
      case 'batch_card_purchase':
        return <CreditCard className="w-4 h-4 text-indigo-500" />;

      case 'sale':
        return <ShoppingCart className="w-4 h-4 text-blue-500" />;
      case 'sale_delete':
      case 'sale_soft_delete':
        return <Trash2 className="w-4 h-4 text-rose-500" />;
      case 'sale_restore':
        return <RotateCcw className="w-4 h-4 text-blue-500" />;

      case 'product_create':
      case 'product_update':
      case 'product_restock':
        return <Package className="w-4 h-4 text-amber-500" />;
      case 'product_delete':
      case 'product_soft_delete':
        return <Trash2 className="w-4 h-4 text-rose-500" />;
      case 'product_restore':
        return <RotateCcw className="w-4 h-4 text-amber-500" />;

      case 'subscription':
        return <Calendar className="w-4 h-4 text-amber-500" />;
      case 'subscription_delete':
        return <Trash2 className="w-4 h-4 text-rose-500" />;
      case 'subscription_restore':
        return <RotateCcw className="w-4 h-4 text-amber-500" />;

      case 'incident_create':
      case 'incident_update':
        return <AlertCircle className="w-4 h-4 text-rose-500" />;
      case 'incident_delete':
        return <Trash2 className="w-4 h-4 text-rose-500" />;
      case 'incident_restore':
        return <RotateCcw className="w-4 h-4 text-rose-500" />;

      case 'cash_in':
      case 'cash_out':
      case 'cash_transaction':
      case 'cash_session_open':
      case 'cash_session_close':
        return <Banknote className="w-4 h-4 text-emerald-500" />;

      default:
        if (type.includes('restore')) {
          return <RotateCcw className="w-4 h-4 text-indigo-500" />;
        }
        if (type.includes('delete')) {
          return <Trash2 className="w-4 h-4 text-rose-500" />;
        }
        return <Layers className="w-4 h-4 text-slate-500" />;
    }
  };

  const getActionTitle = (type: string) => {
    switch (type) {
      case 'member_create':
        return 'Register Member';
      case 'member_update':
        return 'Update Member';
      case 'member_delete':
      case 'member_soft_delete':
        return 'Delete Member';
      case 'member_restore':
        return 'Restore Member';
      case 'attendance':
        return 'Logbook Attendance Check-in';
      case 'attendance_delete':
        return 'Delete Attendance Log';
      case 'attendance_restore':
        return 'Restore Attendance Log';
      case 'card_purchase':
        return 'RFID Card Purchase';
      case 'batch_card_purchase':
        return 'Batch RFID Purchase';
      case 'sale':
        return 'POS Merchandise Sale';
      case 'sale_restore':
        return 'Restore Sale Record';
      case 'sale_delete':
      case 'sale_soft_delete':
        return 'Delete Sale Record';
      case 'subscription':
        return 'Subscription Renewal';
      case 'subscription_delete':
        return 'Delete Subscription';
      case 'subscription_restore':
        return 'Restore Subscription';
      case 'incident_create':
        return 'Incident Report Submission';
      case 'incident_update':
        return 'Update Incident Report';
      case 'incident_delete':
        return 'Delete Incident Report';
      case 'incident_restore':
        return 'Restore Incident Report';
      case 'product_create':
        return 'Add New Product';
      case 'product_update':
        return 'Update Product';
      case 'product_restock':
        return 'Restock Product';
      case 'product_delete':
      case 'product_soft_delete':
        return 'Delete Product';
      case 'product_restore':
        return 'Restore Product';
      case 'cash_in':
        return 'Cash In (Deposit)';
      case 'cash_out':
        return 'Cash Out (Expense)';
      case 'cash_session_open':
        return 'Open Cash Session';
      case 'cash_session_close':
        return 'Close Cash Session';
      default:
        return type
          .split('_')
          .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
          .join(' ');
    }
  };

  interface ParsedSaleItem {
    name: string;
    quantity: number;
    price?: number;
    subtotal?: number;
  }

  const extractSaleItems = (p: any): ParsedSaleItem[] => {
    if (Array.isArray(p.items) && p.items.length > 0) {
      return p.items.map((i: any) => ({
        name: i.name || i.product_name || i.productName || i.title || i.item_name || 'Merchandise Item',
        quantity: Number(i.quantity ?? i.qty ?? i.count ?? 1),
        price: i.price !== undefined ? Number(i.price) : i.unit_price !== undefined ? Number(i.unit_price) : undefined,
        subtotal: i.subtotal !== undefined ? Number(i.subtotal) : undefined,
      }));
    }

    const flatName = p.product_name || p.productName || p.item_name || p.name || p.title;
    if (flatName) {
      const qty = Number(p.quantity ?? p.qty ?? p.count ?? 1);
      const price = p.unit_price ?? p.unitPrice ?? p.price;
      const subtotal = p.totalAmount ?? p.total_amount ?? p.amount;
      return [
        {
          name: flatName,
          quantity: qty,
          price: price !== undefined ? Number(price) : undefined,
          subtotal: subtotal !== undefined ? Number(subtotal) : undefined,
        },
      ];
    }

    return [];
  };

  const getItemSubtitle = (item: any) => {
    const p = item.payload || {};

    if (item.type.startsWith('sale')) {
      const saleItems = extractSaleItems(p);
      if (saleItems.length === 1) {
        return `${saleItems[0].quantity}x ${saleItems[0].name}`;
      }
      if (saleItems.length > 1) {
        return `${saleItems[0].quantity}x ${saleItems[0].name} (+${saleItems.length - 1} more)`;
      }
      if (p.customer_name || p.customerName || p.buyer_name) {
        return `Customer: ${p.customer_name || p.customerName || p.buyer_name}`;
      }
    }

    if (item.type.startsWith('attendance')) {
      const name = p.customer_name || p.customerName || p.member_name || p.memberName;
      if (name) return `Member: ${name}`;
    }

    if (item.type.startsWith('member')) {
      const name = p.full_name || p.fullName || p.name;
      if (name) return `Member: ${name}`;
    }

    if (item.type.startsWith('subscription')) {
      const member = p.memberName || p.member_name;
      const plan = p.planName || p.plan_name || p.plan_type;
      if (member && plan) return `${member} • ${plan}`;
      if (member) return `Member: ${member}`;
      if (plan) return `Plan: ${plan}`;
    }

    if (item.type.includes('card')) {
      if (p.card_uid || p.cardUid) return `RFID: ${p.card_uid || p.cardUid}`;
      if (p.member_name || p.memberName) return `Member: ${p.member_name || p.memberName}`;
    }

    if (item.type.startsWith('product')) {
      const name = p.name || p.product_name || p.title;
      if (name) return `Product: ${name}`;
    }

    const ref = p.reference_number || p.referenceNumber || p.receipt_number || p.receiptNumber || p.invoice_number;
    if (ref) return `Ref: #${ref}`;

    const genericName = p.customer_name || p.customerName || p.full_name || p.fullName || p.name || p.title;
    if (genericName) return String(genericName);

    const targetId = p.sale_id || p.member_id || p.attendance_id || p.product_id || p.subscription_id;
    if (targetId) return `Target: #${String(targetId).slice(-8).toUpperCase()}`;

    const cleanId = String(item.id || '').replace(/^offline_tx_|^offline_/, '');
    return `Item #${cleanId.slice(-6).toUpperCase()}`;
  };

  const renderItemDetails = (item: any) => {
    const p = item.payload || {};

    const formatCurrency = (val: any) => {
      const num = Number(val);
      return isNaN(num) ? '₱0.00' : `₱${num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    };

    const txDate = p.created_at || p.createdAt || p.date || item.createdAt;
    const formattedDate = txDate ? format(new Date(txDate), 'MMM dd, yyyy • hh:mm a') : 'Pending sync';

    if (item.type.startsWith('sale')) {
      const saleItems = extractSaleItems(p);
      const total = Number(p.totalAmount ?? p.total_amount ?? p.amount ?? 0);
      const method = p.payment_method || p.paymentMethod || p.method || 'CASH';
      const customer = p.customer_name || p.customerName || p.buyer_name;
      const ref = p.reference_number || p.referenceNumber || p.receipt_number || p.receiptNumber;

      return (
        <div className="space-y-2">
          {saleItems.length > 0 ? (
            <div className="space-y-1.5">
              {saleItems.map((si, idx) => (
                <div
                  key={idx}
                  className="flex items-center justify-between text-xs bg-slate-100 dark:bg-slate-900/80 px-2.5 py-1.5 rounded-lg border border-slate-200/60 dark:border-slate-800"
                >
                  <div className="flex items-center gap-2 truncate mr-2">
                    <span className="font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded text-[11px] shrink-0">
                      {si.quantity}x
                    </span>
                    <span className="font-medium text-slate-800 dark:text-slate-200 truncate text-[11px]">
                      {si.name}
                    </span>
                  </div>
                  {si.subtotal !== undefined && (
                    <span className="text-slate-700 dark:text-slate-300 font-bold text-[11px] shrink-0 font-mono">
                      {formatCurrency(si.subtotal)}
                    </span>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <p className="text-[11px] text-slate-600 dark:text-slate-300 font-medium">
              Sale Transaction
            </p>
          )}

          <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
            <span className="text-[11px] font-bold text-emerald-700 dark:text-emerald-400 bg-emerald-500/15 px-2 py-0.5 rounded border border-emerald-500/25 font-mono">
              Total: {formatCurrency(total)}
            </span>
            <span className="text-[10px] font-bold text-blue-700 dark:text-blue-400 bg-blue-500/15 px-2 py-0.5 rounded border border-blue-500/25 uppercase">
              {method}
            </span>
            {customer && (
              <span className="text-[10px] text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded border border-slate-200 dark:border-slate-700">
                Customer: {customer}
              </span>
            )}
            {ref && (
              <span className="text-[10px] font-mono text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded border border-slate-200 dark:border-slate-700">
                Ref #{ref}
              </span>
            )}
          </div>

          <div className="text-[10px] text-slate-500 dark:text-slate-400 flex items-center gap-1.5 pt-0.5">
            <Calendar className="w-3 h-3 text-slate-400 shrink-0" />
            <span>Date: {formattedDate}</span>
          </div>
        </div>
      );
    }

    if (item.type.startsWith('attendance')) {
      const name = p.customer_name || p.customerName || p.member_name || p.memberName || 'Guest Check-in';
      const plan = p.plan_name || p.planName || 'Daily Pass';
      const fee = Number(p.entry_fee ?? p.amount ?? p.entryFee ?? 0);
      const method = p.payment_method || p.paymentMethod || 'Cash';

      return (
        <div className="space-y-1.5 text-xs">
          <div className="flex items-center justify-between">
            <span className="font-bold text-slate-800 dark:text-slate-200">{name}</span>
            <span className="font-bold font-mono text-emerald-600 dark:text-emerald-400">
              {formatCurrency(fee)}
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[10px] font-semibold text-sky-700 dark:text-sky-400 bg-sky-500/15 px-2 py-0.5 rounded border border-sky-500/25">
              Plan: {plan}
            </span>
            <span className="text-[10px] font-semibold text-slate-600 dark:text-slate-400 bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded">
              Method: {method}
            </span>
          </div>
          <div className="text-[10px] text-slate-500 dark:text-slate-400 flex items-center gap-1.5 pt-0.5">
            <Calendar className="w-3 h-3 text-slate-400 shrink-0" />
            <span>Date: {formattedDate}</span>
          </div>
        </div>
      );
    }

    if (item.type.startsWith('member')) {
      const name = p.full_name || p.fullName || p.name || 'Member Record';
      const contact = p.phone || p.email || 'No contact provided';
      const plan = p.membership_type || p.membershipType;

      return (
        <div className="space-y-1.5 text-xs">
          <div className="font-bold text-slate-800 dark:text-slate-200">{name}</div>
          <div className="flex flex-wrap items-center gap-1.5 text-[10px]">
            <span className="text-slate-600 dark:text-slate-400 bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded">
              {contact}
            </span>
            {plan && (
              <span className="font-semibold text-blue-700 dark:text-blue-400 bg-blue-500/15 px-2 py-0.5 rounded border border-blue-500/25">
                Plan: {plan}
              </span>
            )}
          </div>
          <div className="text-[10px] text-slate-500 dark:text-slate-400 flex items-center gap-1.5 pt-0.5">
            <Calendar className="w-3 h-3 text-slate-400 shrink-0" />
            <span>Date: {formattedDate}</span>
          </div>
        </div>
      );
    }

    if (item.type.startsWith('subscription')) {
      const plan = p.planName || p.plan_name || p.plan_type || 'Membership Plan';
      const member = p.memberName || p.member_name || 'Member';
      const amount = p.amount !== undefined ? Number(p.amount) : undefined;

      return (
        <div className="space-y-1.5 text-xs">
          <div className="flex items-center justify-between">
            <span className="font-bold text-slate-800 dark:text-slate-200">{member}</span>
            {amount !== undefined && (
              <span className="font-bold font-mono text-amber-600 dark:text-amber-400">
                {formatCurrency(amount)}
              </span>
            )}
          </div>
          <div className="text-[10px] font-semibold text-amber-700 dark:text-amber-400 bg-amber-500/15 px-2 py-0.5 rounded border border-amber-500/25 inline-block">
            Plan: {plan}
          </div>
          <div className="text-[10px] text-slate-500 dark:text-slate-400 flex items-center gap-1.5 pt-0.5">
            <Calendar className="w-3 h-3 text-slate-400 shrink-0" />
            <span>Date: {formattedDate}</span>
          </div>
        </div>
      );
    }

    if (item.type.includes('card')) {
      const card = p.card_uid || p.cardUid || 'RFID Card';
      const member = p.member_name || p.memberName || p.customer_name;
      const amount = p.amount !== undefined ? Number(p.amount) : undefined;

      return (
        <div className="space-y-1.5 text-xs">
          <div className="flex items-center justify-between">
            <span className="font-mono font-bold text-slate-800 dark:text-slate-200">
              UID: {card}
            </span>
            {amount !== undefined && (
              <span className="font-bold font-mono text-indigo-600 dark:text-indigo-400">
                {formatCurrency(amount)}
              </span>
            )}
          </div>
          {member && (
            <div className="text-[10px] text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded inline-block">
              Assigned to: {member}
            </div>
          )}
          <div className="text-[10px] text-slate-500 dark:text-slate-400 flex items-center gap-1.5 pt-0.5">
            <Calendar className="w-3 h-3 text-slate-400 shrink-0" />
            <span>Date: {formattedDate}</span>
          </div>
        </div>
      );
    }

    const dynamicKeys = Object.entries(p)
      .filter(([k, v]) => typeof v !== 'object' && v !== null && v !== '' && !k.toLowerCase().includes('token') && !k.toLowerCase().includes('password'))
      .slice(0, 4);

    return (
      <div className="space-y-1.5 text-xs">
        {dynamicKeys.length > 0 ? (
          <div className="space-y-1">
            {dynamicKeys.map(([k, v]) => (
              <div key={k} className="flex items-center justify-between text-[11px] font-mono">
                <span className="text-slate-500 dark:text-slate-400 capitalize">
                  {k.replace(/_/g, ' ')}:
                </span>
                <span className="font-semibold text-slate-700 dark:text-slate-300 truncate max-w-[200px]">
                  {String(v)}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-[11px] text-slate-500 dark:text-slate-400">
            Queued action parameters ready for sync.
          </p>
        )}
        <div className="text-[10px] text-slate-500 dark:text-slate-400 flex items-center gap-1.5 pt-0.5">
          <Calendar className="w-3 h-3 text-slate-400 shrink-0" />
          <span>Date: {formattedDate}</span>
        </div>
      </div>
    );
  };

  return createPortal(
    <div
      className="fixed inset-0 z-[9999] overflow-hidden"
      aria-labelledby="action-queue-drawer-title"
      role="dialog"
      aria-modal="true"
    >
      {/* Dimmed backdrop */}
      <div
        className="fixed inset-0 bg-black/60 backdrop-blur-xs transition-opacity"
        onClick={closeDrawer}
      />

      <div className="fixed inset-y-0 right-0 max-w-full flex pl-10 z-10 pointer-events-auto">
        <div className="w-screen max-w-md bg-white dark:bg-[#161920] shadow-2xl border-l border-slate-200 dark:border-slate-800 flex flex-col justify-between">
          {/* Header */}
          <div className="p-4 sm:p-5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-3 bg-slate-50/60 dark:bg-slate-900/40">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl bg-[#123c73]/10 dark:bg-blue-500/15 text-[#123c73] dark:text-blue-400 flex items-center justify-center font-bold">
                <Layers className="w-5 h-5" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h2
                    id="action-queue-drawer-title"
                    className="font-black text-sm uppercase tracking-wider text-slate-900 dark:text-white font-heading"
                  >
                    Action Queue
                  </h2>
                  <span className="font-mono text-xs px-2 py-0.5 rounded-full font-bold bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/25">
                    {queueCount} pending
                  </span>
                </div>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 font-medium">
                  Encrypted IndexedDB offline cache
                </p>
              </div>
            </div>

            <button
              onClick={() => {
                triggerHapticButton();
                closeDrawer();
              }}
              className="p-2 rounded-xl text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-200/50 dark:hover:bg-slate-800 transition-colors cursor-pointer"
              title="Close drawer (Esc)"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Network Bar */}
          <div className="px-4 py-2.5 bg-slate-100/70 dark:bg-slate-800/40 border-b border-slate-200/80 dark:border-slate-800/80 flex items-center justify-between text-xs">
            <div className="flex items-center gap-2">
              {isOnline ? (
                <>
                  <Cloud className="w-3.5 h-3.5 text-emerald-500" />
                  <span className="font-medium text-slate-700 dark:text-slate-300">
                    Connection Online
                  </span>
                </>
              ) : (
                <>
                  <CloudOff className="w-3.5 h-3.5 text-amber-500" />
                  <span className="font-medium text-amber-700 dark:text-amber-400 font-semibold">
                    Offline Mode (Queuing Locally)
                  </span>
                </>
              )}
            </div>

            <button
              onClick={() => {
                triggerHapticButton();
                triggerManualSync();
              }}
              disabled={isSyncing || queueCount === 0 || !isOnline}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#123c73] hover:bg-[#0e2c56] dark:bg-blue-600 dark:hover:bg-blue-700 text-white text-xs font-bold transition-all disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer shadow-2xs"
            >
              <RotateCcw className={`w-3 h-3 ${isSyncing ? 'animate-spin' : ''}`} />
              <span>{isSyncing ? 'Syncing...' : 'Sync Now'}</span>
            </button>
          </div>

          {/* Queue Items List */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {isLoading && queueItems.length === 0 ? (
              <div className="py-12 flex flex-col items-center justify-center text-slate-400">
                <RotateCcw className="w-6 h-6 animate-spin mb-2" />
                <span className="text-xs">Loading queued records...</span>
              </div>
            ) : queueItems.length === 0 ? (
              <div className="py-16 flex flex-col items-center justify-center text-center p-6 select-none">
                <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 text-emerald-500 flex items-center justify-center mb-3">
                  <CheckCircle2 className="w-6 h-6" />
                </div>
                <h3 className="text-sm font-bold text-slate-800 dark:text-slate-200">
                  Action Queue Empty
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 max-w-xs leading-relaxed">
                  All member registrations, check-ins, sales, and renewals are fully synchronized with the cloud database.
                </p>
              </div>
            ) : (
              queueItems.map((item) => (
                <div
                  key={item.id}
                  className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#1b2029] shadow-2xs space-y-2 hover:border-slate-300 dark:hover:border-slate-700 transition-all"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <div className="p-1.5 rounded-lg bg-slate-100 dark:bg-slate-800">
                        {getActionIcon(item.type)}
                      </div>
                      <div>
                        <h4 className="text-xs font-bold text-slate-900 dark:text-slate-100 font-heading">
                          {getActionTitle(item.type)}
                        </h4>
                        <span className="font-medium text-[11px] text-slate-500 dark:text-slate-400">
                          {getItemSubtitle(item)}
                        </span>
                      </div>
                    </div>

                    <button
                      onClick={() => {
                        triggerHapticButton();
                        removeItem(item.id);
                      }}
                      className="p-1.5 rounded-lg text-slate-400 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-colors cursor-pointer"
                      title="Discard queued item"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  <div className="text-xs text-slate-700 dark:text-slate-300 bg-slate-50/80 dark:bg-slate-900/60 p-2.5 rounded-lg border border-slate-100 dark:border-slate-800/80">
                    {renderItemDetails(item)}
                  </div>

                  <div className="flex items-center justify-between text-[10px] text-slate-400 dark:text-slate-500 pt-1 border-t border-slate-100 dark:border-slate-800/60">
                    <span className="flex items-center gap-1 font-medium">
                      <Clock className="w-3 h-3" />
                      {item.createdAt
                        ? format(new Date(item.createdAt), 'MMM dd, h:mm a')
                        : 'Just now'}
                    </span>
                    <span className="truncate max-w-[150px]">
                      By: <span className="text-slate-600 dark:text-slate-400 font-semibold">{item.userName || 'Staff'}</span>
                    </span>
                  </div>

                  {item.status === 'conflict' && (
                    <div className="flex items-center gap-1.5 text-xs text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/30 p-2 rounded-lg font-medium border border-rose-200 dark:border-rose-900/40">
                      <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                      <span>Sync conflict: {item.conflictReason || 'Cloud rejection'}</span>
                    </div>
                  )}
                </div>
              ))
            )}
          </div>

          {/* Footer */}
          <div className="p-4 border-t border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/30 text-center">
            <p className="text-[11px] text-slate-400 dark:text-slate-500">
              Operations will sync automatically once an active connection is restored.
            </p>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
};
