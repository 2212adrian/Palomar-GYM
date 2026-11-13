// src/components/ui/TimelineCard.tsx
import React, { useMemo } from 'react';
import { format, parseISO } from 'date-fns';
import { motion, useMotionValue, useTransform } from 'framer-motion';
import {
  Check,
  Clock,
  Printer,
  Trash2,
  GraduationCap,
  User,
  ShieldCheck,
  Crown,
  RotateCcw,
  Banknote,
  Wallet,
  Gift,
  CreditCard,
  CheckCircle2,
  CloudOff,
  AlertCircle,
} from 'lucide-react';

export interface LogRecord {
  id: string;
  timestamp: string;
  checkOutTime?: string;
  memberId: string | null;
  customerName: string;
  customerType:
    'Walk-In' | 'Existing Member' | 'New Membership' | 'Card' | string;
  categoryOrPlan: string;
  paymentMethod: 'Cash' | 'GCash' | 'Promo' | string;
  amountPaid: number;
  basePrice?: number;
  gcashFee?: number;
  cardFee?: number;
  gcashRefNo?: string;
  referenceNumber?: string;
  paymentRef?: string;
  paymentStatus: 'Paid' | 'Promo' | 'Unpaid';
  status: 'Active' | 'Expires Soon' | 'Expired' | 'Suspended';
  isSubscription?: boolean;
  deletable?: boolean;
  receiptNumber?: string | null;
  memberIds?: string[];
  cash_session_id?: string | null;
  sync_status?: 'synced' | 'pending' | 'conflict' | 'failed' | 'dropped';
}

export interface SaleRecord {
  id: string;
  cash_session_id?: string | null;
  created_at?: string;
  createdAt?: string;
  receipt_no: string;
  product_name?: string;
  productName?: string;
  quantity?: number;
  total_amount: number;
  totalAmount?: number;
  payment_method: string;
  amount_received?: number;
  amountReceived?: number;
  change_calculated?: number;
  gcash_fee_applied?: number;
  reference_number?: string;
  items?: Array<{
    productId: string;
    productName: string;
    product_name?: string;
    quantity: number;
    price: number;
  }>;
  sync_status?: 'synced' | 'pending' | 'conflict' | 'failed' | 'dropped';
}

interface TimelineCardProps {
  mode: 'attendance' | 'sale';
  data: any;
  canDelete: boolean;
  canPrint?: boolean;
  printDisabledReason?: string;
  deleteDisabledReason?: string;
  onSelectReceipt: (data: any) => void;
  onTriggerDelete: (data: any) => void;
  onTriggerCollectPayment?: (data: any) => void;
  onTriggerUndoPayment?: (data: any) => void;
  onDragEnd: (_event: any, info: any, data: any) => void;
  viewMode?: 'timeline' | 'compact' | 'grid';
}

export type EntryCategory =
  | 'walkin_student'
  | 'walkin_regular'
  | 'member'
  | 'new_subscription'
  | 'renewal'
  | 'card';

export const getEntryCategory = (log: LogRecord): EntryCategory => {
  const cType = String(log.customerType || '');
  const plan = (log.categoryOrPlan || '').toLowerCase();
  const cTypeLower = cType.toLowerCase();

  if (
    cType === 'Card' ||
    plan.includes('physical membership card') ||
    plan.includes('card fee')
  ) {
    return 'card';
  }

  const isEntryOrCheckIn =
    plan.includes('entry') ||
    plan.includes('check-in') ||
    plan.includes('checkin') ||
    plan.includes('daily') ||
    plan.includes('walk-in') ||
    plan.includes('guest');

  if (!isEntryOrCheckIn && (cTypeLower.includes('renewal') || plan.includes('renewal'))) {
    return 'renewal';
  }

  if (
    cType === 'New Membership' ||
    (!isEntryOrCheckIn &&
      (log.isSubscription ||
        plan.includes('new membership') ||
        plan.includes('subscription') ||
        plan.includes('monthly') ||
        plan.includes('yearly') ||
        plan.includes('annual')))
  ) {
    return 'new_subscription';
  }

  if (cType === 'Existing Member' || cType === 'Member') {
    return 'member';
  }

  if (plan.includes('student') || plan.includes('stud')) {
    return 'walkin_student';
  }

  return 'walkin_regular';
};

export const getPaymentMethodInfo = (method: string) => {
  const normalized = (method || '').toLowerCase();

  if (normalized.includes('gcash')) {
    return {
      type: 'gcash',
      label: 'GCash',
      icon: Wallet,
      badgeClass:
        'bg-blue-50 text-blue-900 border-blue-200/90 dark:bg-blue-900/80 dark:text-blue-200 dark:border-blue-500 font-bold tracking-wider',
    };
  }

  if (normalized.includes('cash')) {
    return {
      type: 'cash',
      label: 'Cash',
      icon: Banknote,
      badgeClass:
        'bg-emerald-50 text-emerald-900 border-emerald-200/90 dark:bg-emerald-900/80 dark:text-emerald-200 dark:border-emerald-500 font-bold tracking-wider',
    };
  }

  return {
    type: 'Promo',
    label: 'Promo',
    icon: Gift,
    badgeClass:
      'bg-sky-50 text-sky-900 border-sky-200/90 dark:bg-sky-900/80 dark:text-sky-200 dark:border-sky-500 font-bold tracking-wider',
  };
};

const CATEGORY_THEMES = {
  card: {
    label: 'CARD PURCHASE',
    shortLabel: 'CARD',
    icon: CreditCard,
    borderAccent: 'bg-amber-500 dark:bg-amber-400',
    badgeClass:
      'bg-amber-50 text-amber-900 border-amber-200/90 dark:bg-amber-950 dark:text-amber-300 dark:border-amber-500 font-bold',
    iconBoxClass:
      'bg-amber-50/80 text-amber-800 border-amber-200 dark:bg-amber-950 dark:text-amber-300 dark:border-amber-600 shadow-xs',
    priceTextClass: 'text-amber-700 dark:text-amber-400 font-black',
  },
  walkin_student: {
    label: 'STUDENT WALK-IN',
    shortLabel: 'STUDENT',
    icon: GraduationCap,
    borderAccent: 'bg-cyan-500 dark:bg-cyan-400',
    badgeClass:
      'bg-cyan-50 text-cyan-900 border-cyan-200/90 dark:bg-cyan-950 dark:text-cyan-300 dark:border-cyan-500 font-bold',
    iconBoxClass:
      'bg-cyan-50/80 text-cyan-800 border-cyan-200 dark:bg-cyan-950 dark:text-cyan-300 dark:border-cyan-600 shadow-xs',
    priceTextClass: 'text-cyan-700 dark:text-cyan-400 font-black',
  },
  walkin_regular: {
    label: 'REGULAR WALK-IN',
    shortLabel: 'REGULAR',
    icon: User,
    borderAccent: 'bg-sky-500 dark:bg-sky-400',
    badgeClass:
      'bg-sky-50 text-sky-900 border-sky-200/90 dark:bg-sky-950 dark:text-sky-300 dark:border-sky-500 font-bold',
    iconBoxClass:
      'bg-sky-50/80 text-sky-800 border-sky-200 dark:bg-sky-950 dark:text-sky-300 dark:border-sky-600 shadow-xs',
    priceTextClass: 'text-sky-700 dark:text-sky-400 font-black',
  },
  member: {
    label: 'EXISTING MEMBER',
    shortLabel: 'MEMBER',
    icon: ShieldCheck,
    borderAccent: 'bg-blue-600 dark:bg-blue-400',
    badgeClass:
      'bg-blue-50 text-blue-900 border-blue-200/90 dark:bg-blue-950 dark:text-blue-300 dark:border-blue-500 font-bold',
    iconBoxClass:
      'bg-blue-50/80 text-blue-800 border-blue-200 dark:bg-blue-950 dark:text-blue-300 dark:border-blue-600 shadow-xs',
    priceTextClass: 'text-blue-700 dark:text-blue-400 font-black',
  },
  new_subscription: {
    label: 'NEW MEMBERSHIP',
    shortLabel: 'SUBSCRIPTION',
    icon: Crown,
    borderAccent: 'bg-emerald-500 dark:bg-emerald-400',
    badgeClass:
      'bg-emerald-50 text-emerald-900 border-emerald-200/90 dark:bg-emerald-950 dark:text-emerald-300 dark:border-emerald-500 font-bold',
    iconBoxClass:
      'bg-emerald-50/80 text-emerald-800 border-emerald-200 dark:bg-emerald-950 dark:text-emerald-300 dark:border-emerald-600 shadow-xs',
    priceTextClass: 'text-emerald-700 dark:text-emerald-400 font-black',
  },
  renewal: {
    label: 'MEMBERSHIP RENEWAL',
    shortLabel: 'RENEWAL',
    icon: RotateCcw,
    borderAccent: 'bg-teal-500 dark:bg-teal-400',
    badgeClass:
      'bg-teal-50 text-teal-900 border-teal-200/90 dark:bg-teal-950 dark:text-teal-300 dark:border-teal-500 font-bold',
    iconBoxClass:
      'bg-teal-50/80 text-teal-800 border-teal-200 dark:bg-teal-950 dark:text-teal-300 dark:border-teal-600 shadow-xs',
    priceTextClass: 'text-teal-700 dark:text-teal-400 font-black',
  },
};

const TimelineCardComponent: React.FC<TimelineCardProps> = ({
  mode,
  data,
  canDelete,
  canPrint = true,
  printDisabledReason,
  deleteDisabledReason,
  onSelectReceipt,
  onTriggerDelete,
  onTriggerCollectPayment,
  onTriggerUndoPayment,
  onDragEnd,
  viewMode = 'timeline',
}) => {
  const x = useMotionValue(0);

  const receiptOpacity = useTransform(x, [15, 60], [0, 1]);
  const removeOpacity = useTransform(x, [-60, -15], [1, 0]);

  // --- ATTENDANCE MODE ---
  const attendanceMeta = useMemo(() => {
    if (mode !== 'attendance') return null;
    const log = data as LogRecord;
    const entryCategory = getEntryCategory(log);
    const theme = CATEGORY_THEMES[entryCategory];
    const paymentMethodInfo = getPaymentMethodInfo(log.paymentMethod);
    const isPaid =
      log.paymentStatus === 'Paid' || log.paymentStatus === 'Promo';
    const formattedInTime = log.timestamp
      ? format(parseISO(log.timestamp), 'hh:mm a')
      : 'N/A';
    const planLabel =
      log.categoryOrPlan.replace('Pass', '').replace('Membership', '').trim() ||
      log.categoryOrPlan;

    const planText = (log.categoryOrPlan || '').toLowerCase();
    const customerTypeText = (log.customerType || '').toLowerCase();

    // Monthly and yearly subscriptions, new memberships, and renewals are never deletable from the logbook.
    // However, daily attendance check-ins (e.g. Monthly Member Entry, Yearly Member Entry) are check-ins, NOT subscription purchases.
    const isEntryOrCheckIn =
      planText.includes('entry') ||
      planText.includes('check-in') ||
      planText.includes('checkin') ||
      planText.includes('daily') ||
      planText.includes('walk-in') ||
      planText.includes('guest');

    const isSubscription =
      Boolean(log.isSubscription) ||
      (!isEntryOrCheckIn &&
        (entryCategory === 'new_subscription' ||
          log.customerType === 'New Membership' ||
          log.customerType === 'Membership Renewal' ||
          customerTypeText.includes('renewal') ||
          customerTypeText.includes('subscription') ||
          planText.includes('monthly') ||
          planText.includes('yearly') ||
          planText.includes('annual') ||
          planText.includes('renewal') ||
          planText.includes('membership')));

    const effectiveCanDelete = isSubscription ? false : canDelete;

    const effectiveDeleteDisabledReason = isSubscription
      ? 'Monthly and yearly subscriptions and renewals cannot be deleted from the logbook. They can only be voided within 24 hours in Member Subscriptions.'
      : deleteDisabledReason;

    const syncStatus = log.sync_status || 'synced';

    return {
      log,
      entryCategory,
      theme,
      paymentMethodInfo,
      isPaid,
      formattedInTime,
      planLabel,
      isSubscription,
      effectiveCanDelete,
      effectiveDeleteDisabledReason,
      syncStatus,
    };
  }, [mode, data, canDelete, deleteDisabledReason]);

  // --- SALE MODE ---
  const saleMeta = useMemo(() => {
    if (mode !== 'sale') return null;
    const tx = data as SaleRecord;
    const syncStatus = tx.sync_status || 'synced';
    const totalUnits =
      tx.quantity ||
      tx.items?.reduce((sum: number, i: any) => sum + i.quantity, 0) ||
      1;
    const formattedTime =
      tx.created_at || tx.createdAt
        ? format(parseISO(tx.created_at || tx.createdAt || ''), 'hh:mm a')
        : 'N/A';
    const summaryHeader =
      tx.items && tx.items.length > 0
        ? (tx.items[0].productName || tx.items[0].product_name) +
          (tx.items.length > 1
            ? ` & ${tx.items.length - 1} other item${tx.items.length - 1 > 1 ? 's' : ''}`
            : '')
        : tx.product_name || tx.productName || 'Sales Transaction';

    const paymentMethodStr = (tx.payment_method || '').toLowerCase();
    const isGCash = paymentMethodStr.includes('gcash');
    const isCash = paymentMethodStr.includes('cash');

    const theme = isGCash
      ? {
          type: 'gcash',
          borderAccent: 'bg-blue-500 dark:bg-blue-400',
          badgeClass: 'bg-blue-600 text-white border border-blue-500 font-bold',
          iconBoxClass:
            'bg-blue-50 text-blue-800 border-blue-200 dark:bg-blue-950 dark:text-blue-300 dark:border-blue-600 shadow-xs',
          priceTextClass: 'text-blue-700 dark:text-blue-400 font-black',
        }
      : isCash
        ? {
            type: 'cash',
            borderAccent: 'bg-emerald-500 dark:bg-emerald-400',
            badgeClass:
              'bg-emerald-700 text-white border border-emerald-600 dark:bg-emerald-800 dark:text-emerald-100 dark:border-emerald-400 font-bold',
            iconBoxClass:
              'bg-emerald-50 text-emerald-800 border-emerald-200 dark:bg-emerald-950 dark:text-emerald-300 dark:border-emerald-600 shadow-xs',
            priceTextClass: 'text-emerald-700 dark:text-emerald-400 font-black',
          }
        : {
            type: 'other',
            borderAccent: 'bg-slate-400',
            badgeClass:
              'bg-slate-700 text-white border border-slate-500 font-bold',
            iconBoxClass:
              'bg-slate-100 text-slate-800 border-slate-300 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-600 shadow-xs',
            priceTextClass: 'text-slate-800 dark:text-slate-300 font-black',
          };

    const refNumber = tx.reference_number;
    const receivedAmount = Number(tx.amount_received || 0);
    const totalAmount = Number(tx.total_amount || tx.totalAmount || 0);
    const changeCalculated = Number(tx.change_calculated || 0);
    const gcashFeeApplied = Number(tx.gcash_fee_applied || 0);

    return {
      tx,
      totalUnits,
      formattedTime,
      summaryHeader,
      isGCash,
      isCash,
      theme,
      refNumber,
      receivedAmount,
      totalAmount,
      changeCalculated,
      gcashFeeApplied,
      syncStatus,
    };
  }, [mode, data]);

// after
  const baseCardStyle = useMemo(() => {
    if (mode === 'attendance' && attendanceMeta?.isSubscription) {
      return 'bg-gradient-to-r from-emerald-50/25 via-white to-white dark:from-emerald-950/20 dark:via-[#161920] dark:to-[#161920] hover:bg-slate-50/80 dark:hover:bg-[#1d222b] border border-emerald-500/35 dark:border-emerald-500/25 shadow-[0_2px_12px_-3px_rgba(16,185,129,0.08)] hover:shadow-[0_4px_16px_-4px_rgba(16,185,129,0.15)]';
    }
    return 'bg-white dark:bg-[#161920] hover:bg-slate-50/80 dark:hover:bg-[#1d222b] border border-slate-200/90 dark:border-white/10 shadow-[0_2px_8px_-2px_rgba(15,23,42,0.06)] hover:shadow-[0_4px_16px_-4px_rgba(15,23,42,0.1)]';
  }, [mode, attendanceMeta?.isSubscription]);

  const containerClasses = useMemo(() => {
    if (viewMode === 'compact') {
      return `pointer-events-auto flex items-center relative overflow-hidden select-none z-10 touch-pan-y min-h-[60px] sm:min-h-[58px] w-full group rounded-xl transition-[background-color,border-color,box-shadow] duration-150 will-change-transform py-2 px-2.5 sm:px-3 ${baseCardStyle}`;
    }
    if (viewMode === 'grid') {
      return `pointer-events-auto flex flex-col justify-between relative overflow-hidden select-none z-10 min-h-[145px] sm:min-h-[160px] h-full w-full group rounded-xl sm:rounded-2xl transition-[background-color,border-color,box-shadow] duration-150 will-change-transform p-2.5 sm:p-3.5 ${baseCardStyle}`;
    }
    return `pointer-events-auto flex items-stretch relative overflow-hidden select-none z-10 touch-pan-y min-h-[72px] sm:min-h-[76px] w-full group rounded-2xl transition-[background-color,border-color,box-shadow] duration-150 will-change-transform p-2.5 sm:p-3.5 ${baseCardStyle}`;
  }, [viewMode]);

  const CategoryIcon = attendanceMeta?.theme.icon || User;
  const PaymentIcon = attendanceMeta?.paymentMethodInfo.icon || Banknote;
  const isSwipeEnabled = viewMode !== 'grid';

  return (
    <div className="relative overflow-hidden rounded-2xl w-full h-full">
      {/* Swipe background tracks */}
      {isSwipeEnabled && (
        <div className="absolute inset-0 rounded-2xl pointer-events-none select-none z-0 overflow-hidden bg-slate-200 dark:bg-[#0c0e12]">
          {canPrint && (
            <motion.div
              style={{ opacity: receiptOpacity }}
              className="absolute inset-y-0 left-0 bg-blue-600 flex items-center pl-6 text-white text-xs font-heading tracking-wider font-bold w-1/2"
            >
              RECEIPT
            </motion.div>
          )}

          {!attendanceMeta?.isSubscription && (canDelete || !deleteDisabledReason) && (
            <motion.div
              style={{ opacity: removeOpacity }}
              className="absolute inset-y-0 right-0 bg-rose-600 flex items-center justify-end pr-6 text-white text-xs font-heading tracking-wider font-bold w-1/2"
            >
              REMOVE
            </motion.div>
          )}
        </div>
      )}

      {/* Main card */}
      <motion.div
        style={{ x: isSwipeEnabled ? x : 0 }}
        drag={isSwipeEnabled && (canPrint || (!attendanceMeta?.isSubscription && canDelete && !deleteDisabledReason)) ? 'x' : false}
        dragConstraints={{
          left: !attendanceMeta?.isSubscription && canDelete && !deleteDisabledReason ? -100 : 0,
          right: canPrint ? 100 : 0,
        }}
        dragElastic={{
          left: !attendanceMeta?.isSubscription && canDelete && !deleteDisabledReason ? 0.2 : 0,
          right: canPrint ? 0.2 : 0,
        }}
        dragSnapToOrigin={true}
        dragTransition={{ bounceStiffness: 500, bounceDamping: 32 }}
        onDragEnd={(e, info) => {
          if (!isSwipeEnabled) return;
          if ((attendanceMeta?.isSubscription || !canDelete || deleteDisabledReason) && info.offset.x < -40) {
            return;
          }
          if (!canPrint && info.offset.x > 40) {
            return;
          }
          onDragEnd(e, info, data);
        }}
        className={containerClasses}
      >
        {/* ATTENDANCE CARD */}
        {mode === 'attendance' && attendanceMeta && (
          <>
            {viewMode === 'compact' ? (
              <>
                <div
                  className={`absolute left-0 top-0 bottom-0 w-1 ${attendanceMeta.theme.borderAccent}`}
                />
                <div className="flex items-center justify-between gap-2 sm:gap-3 w-full min-w-0 pl-1">
                  {/* Left & Center: Avatar Icon & Roomy 2-Tier Identity Block */}
                  <div className="flex items-center gap-2.5 min-w-0 flex-1">
                    <div
                      className={`w-8 h-8 sm:w-8.5 sm:h-8.5 rounded-xl flex items-center justify-center shrink-0 border relative ${attendanceMeta.theme.iconBoxClass}`}
                    >
                      <CategoryIcon className="w-4 h-4 stroke-[2]" />
                      <span
                        className={`absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border border-white dark:border-slate-900 ${
                          attendanceMeta.isPaid ? 'bg-emerald-500' : 'bg-amber-500'
                        }`}
                      />
                    </div>

                    <div className="min-w-0 flex-1 flex flex-col justify-center">
                      {/* Line 1: Identity & Customer Name with Ample Space */}
                      <div className="flex items-center gap-1.5 min-w-0">
                        {attendanceMeta.entryCategory === 'card' &&
                        attendanceMeta.log.customerName.includes('others') ? (
                          <span className="font-mono text-[8px] sm:text-[8.5px] font-black text-amber-900 bg-amber-100 border-amber-300 dark:text-amber-200 dark:bg-amber-900/50 dark:border-amber-600 px-1.5 py-0.2 rounded border shrink-0">
                            BATCH
                          </span>
                        ) : attendanceMeta.log.memberId ? (
                          <span className="font-mono text-[8.5px] sm:text-[9px] font-bold text-slate-800 bg-slate-100 border-slate-300 dark:text-zinc-100 dark:bg-zinc-800 dark:border-zinc-600 px-1.5 py-0.2 rounded border shrink-0">
                            #{attendanceMeta.log.memberId}
                          </span>
                        ) : (
                          <span className="font-mono text-[8px] font-bold text-slate-700 bg-slate-100 border-slate-300 dark:text-slate-300 dark:bg-slate-800 dark:border-slate-600 px-1.5 py-0.2 rounded border shrink-0">
                            GUEST
                          </span>
                        )}
                        <h4 className="text-xs sm:text-sm font-heading font-black text-slate-900 dark:text-white uppercase truncate tracking-wide">
                          {attendanceMeta.log.customerName}
                        </h4>
                      </div>

                      {/* Line 2: Time & Entry Plan Metadata */}
                      <div className="flex items-center gap-1.5 text-[10px] text-slate-500 dark:text-zinc-400 font-medium truncate mt-0.5">
                        <span className="font-mono text-[9px] text-slate-500 dark:text-zinc-400 font-bold shrink-0 flex items-center gap-0.5">
                          <Clock className="w-2.5 h-2.5 text-blue-500 dark:text-blue-400 shrink-0" />
                          <span>{attendanceMeta.formattedInTime}</span>
                        </span>
                        <span className="text-slate-300 dark:text-zinc-700">•</span>
                        <span className="truncate">{attendanceMeta.planLabel}</span>
                        <span className="hidden sm:inline-block text-slate-300 dark:text-zinc-700">•</span>
                        <span className="hidden sm:inline-block shrink-0">{attendanceMeta.paymentMethodInfo.label}</span>
                      </div>
                    </div>
                  </div>

                  {/* Right: Uniform Price, Status & Big-Hitbox Action Buttons */}
                  <div className="flex items-center gap-1.5 sm:gap-2.5 shrink-0 justify-end">
                    {attendanceMeta.isSubscription ? (
                      <div className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-500/10 dark:bg-emerald-500/15 border border-emerald-500/30 text-right">
                        <span className="text-[8px] font-heading font-black tracking-widest text-emerald-600 dark:text-emerald-400 uppercase leading-none">
                          PAID
                        </span>
                        <span className="text-xs sm:text-sm font-mono font-black text-emerald-600 dark:text-emerald-400">
                          ₱{attendanceMeta.log.amountPaid.toFixed(2)}
                        </span>
                      </div>
                    ) : (
                      <>
                        <span
                          className={`text-xs sm:text-sm font-mono font-black min-w-[50px] sm:min-w-[60px] text-right ${attendanceMeta.theme.priceTextClass}`}
                        >
                          ₱{attendanceMeta.log.amountPaid.toFixed(2)}
                        </span>

                        <div className="shrink-0">
                          {canDelete && attendanceMeta.log.amountPaid > 0 ? (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                if (attendanceMeta.isPaid) {
                                  onTriggerUndoPayment?.(attendanceMeta.log);
                                } else {
                                  onTriggerCollectPayment?.(attendanceMeta.log);
                                }
                              }}
                              className={`h-7 px-2.5 rounded-lg text-[9px] font-heading font-bold uppercase tracking-wider transition-all cursor-pointer border flex items-center justify-center ${
                                attendanceMeta.isPaid
                                  ? 'bg-emerald-50 text-emerald-800 border-emerald-300 dark:bg-emerald-950/80 dark:text-emerald-300 dark:border-emerald-500 hover:bg-rose-50 hover:text-rose-700'
                                  : 'bg-amber-400 text-slate-950 border-amber-300 dark:bg-amber-500'
                              }`}
                            >
                              {attendanceMeta.isPaid ? 'PAID' : 'COLLECT'}
                            </button>
                          ) : (
                            <span
                              className={`h-6 px-2 rounded-md text-[8.5px] font-heading font-bold uppercase border flex items-center justify-center ${
                                attendanceMeta.log.amountPaid <= 0
                                  ? 'bg-slate-100 text-slate-600 border-slate-300 dark:bg-zinc-800 dark:text-zinc-400 dark:border-zinc-700'
                                  : attendanceMeta.isPaid
                                    ? 'bg-emerald-50 text-emerald-800 border-emerald-300 dark:bg-emerald-950 dark:text-emerald-300 dark:border-emerald-500'
                                    : 'bg-rose-50 text-rose-700 border-rose-300 dark:bg-rose-950 dark:text-rose-300 dark:border-rose-500'
                              }`}
                            >
                              {attendanceMeta.log.amountPaid <= 0
                                ? 'FREE'
                                : attendanceMeta.isPaid
                                  ? 'PAID'
                                  : 'UNPAID'}
                            </span>
                          )}
                        </div>
                      </>
                    )}

                    {/* Outer-edge Action Buttons: Hidden on Mobile (Swipe Available), Visible on PC */}
                    <div className="hidden sm:flex items-center gap-1 sm:gap-1.5 shrink-0 sm:mr-0">
                      <button
                        type="button"
                        disabled={!canPrint}
                        onClick={(e) => {
                          e.stopPropagation();
                          if (!canPrint) return;
                          onSelectReceipt(attendanceMeta.log);
                        }}
                        className="w-8.5 h-8.5 sm:w-8 sm:h-8 flex items-center justify-center rounded-lg border border-slate-200/90 dark:border-zinc-800 text-slate-500 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-950/80 dark:text-zinc-400 cursor-pointer disabled:opacity-30 touch-manipulation relative active:scale-95 transition-transform"
                        title="View Receipt"
                      >
                        <Printer className="w-3.5 h-3.5 pointer-events-none" />
                      </button>

                      {!attendanceMeta.isSubscription &&
                        (attendanceMeta.effectiveCanDelete ||
                          attendanceMeta.effectiveDeleteDisabledReason) && (
                          <button
                            type="button"
                            disabled={!attendanceMeta.effectiveCanDelete}
                            onClick={(e) => {
                              e.stopPropagation();
                              if (attendanceMeta.effectiveCanDelete) {
                                onTriggerDelete(attendanceMeta.log);
                              }
                            }}
                            className="w-8.5 h-8.5 sm:w-8 sm:h-8 flex items-center justify-center rounded-lg border border-slate-200/90 dark:border-zinc-800 text-slate-500 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/80 dark:text-zinc-400 cursor-pointer disabled:opacity-30 touch-manipulation relative active:scale-95 transition-transform"
                            title="Remove record"
                          >
                            <Trash2 className="w-3.5 h-3.5 pointer-events-none" />
                          </button>
                        )}
                    </div>
                  </div>
                </div>
              </>            ) : viewMode === 'grid' ? (
              <div className="flex flex-col justify-between w-full h-full pl-0.5 sm:pl-1">
                <div
                  className={`absolute left-0 top-0 bottom-0 w-1 sm:w-1.5 ${attendanceMeta.theme.borderAccent}`}
                />
                
                {/* Top Section: Header & Badges Container */}
                <div className="space-y-2">
                  {/* Header: Avatar, Name, Time */}
                  <div className="flex items-start justify-between gap-1.5 pb-2 border-b border-slate-100 dark:border-white/5">
                    <div className="flex items-center gap-1.5 sm:gap-2.5 min-w-0 flex-1">
                      <div
                        className={`w-7 h-7 sm:w-9 sm:h-9 rounded-lg sm:rounded-xl flex items-center justify-center border shrink-0 relative transition-transform duration-200 group-hover:scale-105 ${attendanceMeta.theme.iconBoxClass}`}
                      >
                        <CategoryIcon className="w-3.5 h-3.5 sm:w-4.5 sm:h-4.5 stroke-[2]" />
                        <div
                          className={`absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 sm:w-3 sm:h-3 rounded-full flex items-center justify-center text-white border border-white dark:border-slate-900 ${
                            attendanceMeta.isPaid ? 'bg-emerald-500' : 'bg-amber-500'
                          }`}
                        >
                          {attendanceMeta.isPaid ? (
                            <Check className="w-1.5 h-1.5 sm:w-2 sm:h-2 stroke-[3]" />
                          ) : (
                            <Clock className="w-1.5 h-1.5 sm:w-2 sm:h-2 stroke-[3]" />
                          )}
                        </div>
                      </div>

                      <div className="min-w-0 flex-1 space-y-0.5">
                        <div className="flex items-center gap-1 flex-wrap min-w-0">
                          {attendanceMeta.entryCategory === 'card' &&
                          attendanceMeta.log.customerName.includes('others') ? (
                            <span className="font-mono text-[7px] sm:text-[8px] font-black text-amber-900 bg-amber-100 border-amber-300 dark:text-amber-200 dark:bg-amber-900/50 dark:border-amber-600 px-1 py-0.2 rounded border">
                              BATCH
                            </span>
                          ) : attendanceMeta.log.memberId ? (
                            <span className="font-mono text-[7px] sm:text-[8px] font-bold text-slate-800 bg-slate-100 border-slate-300 dark:text-zinc-100 dark:bg-zinc-800 dark:border-zinc-600 px-1 py-0.2 rounded border">
                              #{attendanceMeta.log.memberId}
                            </span>
                          ) : (
                            <span className="font-mono text-[7px] sm:text-[8px] font-bold text-slate-700 bg-slate-100 border-slate-300 dark:text-slate-300 dark:bg-slate-800 dark:border-slate-600 px-1 py-0.2 rounded border">
                              GUEST
                            </span>
                          )}
                          <h4 className="text-[11px] sm:text-xs font-heading font-black tracking-wide text-slate-900 dark:text-white uppercase truncate">
                            {attendanceMeta.log.customerName}
                          </h4>
                        </div>
                        <p className="text-[8.5px] sm:text-[9.5px] text-slate-500 dark:text-zinc-400 font-medium truncate">
                          {attendanceMeta.planLabel}
                        </p>
                      </div>
                    </div>

                    {/* Header Right: Floating Time Pill + Sync Indicator */}
                    <div className="flex items-center gap-1 shrink-0 pt-0.5">
                      <span className="inline-flex items-center gap-0.5 px-1.5 py-0.2 rounded-md bg-slate-100 dark:bg-zinc-800/90 border border-slate-200/90 dark:border-zinc-700 text-[7.5px] sm:text-[8.5px] font-mono font-bold text-slate-600 dark:text-slate-300 shadow-2xs">
                        <Clock className="w-2 h-2 text-blue-500 dark:text-blue-400 shrink-0" />
                        <span>{attendanceMeta.formattedInTime}</span>
                      </span>

                      {attendanceMeta.syncStatus === 'pending' ? (
                        <span
                          title="Pending Offline Sync"
                          className="p-0.5 rounded bg-amber-50 dark:bg-amber-950/80 text-amber-600 dark:text-amber-400 border border-amber-300 dark:border-amber-700"
                        >
                          <CloudOff className="w-2.5 h-2.5 animate-pulse" />
                        </span>
                      ) : attendanceMeta.syncStatus === 'conflict' ||
                        attendanceMeta.syncStatus === 'failed' ||
                        attendanceMeta.syncStatus === 'dropped' ? (
                        <span
                          title="Sync Failed"
                          className="p-0.5 rounded bg-rose-50 dark:bg-rose-950/80 text-rose-600 dark:text-rose-400 border border-rose-300 dark:border-rose-700"
                        >
                          <AlertCircle className="w-2.5 h-2.5" />
                        </span>
                      ) : (
                        <CheckCircle2 className="w-3 h-3 text-emerald-600 dark:text-emerald-400" />
                      )}
                    </div>
                  </div>

                  {/* Card Body: Structured Category & Payment Badges */}
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span
                      className={`px-1.5 sm:px-2 py-0.5 rounded text-[8px] sm:text-[8.5px] font-heading font-bold uppercase border inline-flex items-center gap-1 shrink-0 ${attendanceMeta.theme.badgeClass}`}
                    >
                      <CategoryIcon className="w-2.5 h-2.5 stroke-[2]" />
                      <span>{attendanceMeta.theme.shortLabel || attendanceMeta.theme.label}</span>
                    </span>

                    <span
                      className={`px-1.5 sm:px-2 py-0.5 rounded text-[8px] sm:text-[8.5px] font-heading font-bold uppercase border inline-flex items-center gap-1 shrink-0 ${attendanceMeta.paymentMethodInfo.badgeClass}`}
                    >
                      <PaymentIcon className="w-2.5 h-2.5 stroke-[2]" />
                      <span>{attendanceMeta.paymentMethodInfo.label}</span>
                    </span>
                  </div>
                </div>

                {/* Card Footer: Scaled Financial Metric & Comfortable Action Touch Targets */}
                <div className="flex items-center justify-between gap-1.5 pt-2 border-t border-slate-100 dark:border-white/5 mt-auto">
                  <div className="min-w-0 pr-1">
                    <span className="text-[7.5px] sm:text-[8.5px] font-heading font-extrabold tracking-widest text-slate-400 block uppercase leading-none">
                      {attendanceMeta.isSubscription ? 'PAID' : 'ENTRY FEE'}
                    </span>
                    <span
                      className={`text-sm sm:text-base font-mono font-black mt-0.5 block leading-tight ${
                        attendanceMeta.isSubscription
                          ? 'text-emerald-600 dark:text-emerald-400'
                          : attendanceMeta.theme.priceTextClass
                      }`}
                    >
                      ₱{attendanceMeta.log.amountPaid.toFixed(2)}
                    </span>
                  </div>

                  <div className="flex items-center gap-1 sm:gap-1.5 shrink-0">
                    {!attendanceMeta.isSubscription && (
                      canDelete && attendanceMeta.log.amountPaid > 0 ? (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            if (attendanceMeta.isPaid) {
                              onTriggerUndoPayment?.(attendanceMeta.log);
                            } else {
                              onTriggerCollectPayment?.(attendanceMeta.log);
                            }
                          }}
                          className={`h-7 sm:h-7.5 px-2.5 sm:px-3 rounded-lg text-[9px] sm:text-[9.5px] font-heading font-black uppercase tracking-wider transition-all cursor-pointer border flex items-center justify-center shrink-0 shadow-2xs active:scale-95 ${
                            attendanceMeta.isPaid
                              ? 'bg-emerald-50 text-emerald-800 border-emerald-300 dark:bg-emerald-950/80 dark:text-emerald-300 dark:border-emerald-500 hover:bg-rose-50 hover:text-rose-700'
                              : 'bg-amber-400 text-slate-950 border-amber-300 dark:bg-amber-500 hover:bg-emerald-500 hover:text-white'
                          }`}
                        >
                          {attendanceMeta.isPaid ? 'PAID' : 'COLLECT'}
                        </button>
                      ) : (
                        <span
                          className={`h-7 sm:h-7.5 px-2 sm:px-2.5 rounded-lg text-[9px] sm:text-[9.5px] font-heading font-black uppercase border flex items-center justify-center shrink-0 ${
                            attendanceMeta.log.amountPaid <= 0
                              ? 'bg-slate-100 text-slate-600 border-slate-300 dark:bg-zinc-800 dark:text-zinc-400 dark:border-zinc-700'
                              : attendanceMeta.isPaid
                                ? 'bg-emerald-50 text-emerald-800 border-emerald-300 dark:bg-emerald-950 dark:text-emerald-300 dark:border-emerald-500'
                                : 'bg-rose-50 text-rose-700 border-rose-300 dark:bg-rose-950 dark:text-rose-300 dark:border-rose-500'
                          }`}
                        >
                          {attendanceMeta.log.amountPaid <= 0
                            ? 'FREE'
                            : attendanceMeta.isPaid
                              ? 'PAID'
                              : 'UNPAID'}
                        </span>
                      )
                    )}

                    <button
                      type="button"
                      disabled={!canPrint}
                      onClick={(e) => {
                        e.stopPropagation();
                        if (!canPrint) return;
                        onSelectReceipt(attendanceMeta.log);
                      }}
                      className="w-7 h-7 sm:w-7.5 sm:h-7.5 rounded-lg border border-slate-200/90 dark:border-white/10 flex items-center justify-center text-slate-600 dark:text-slate-300 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-950/80 shrink-0 cursor-pointer disabled:opacity-40 active:scale-95 transition-all touch-manipulation"
                      title="View Receipt"
                    >
                      <Printer className="w-3.5 h-3.5 sm:w-4 sm:h-4 stroke-[2]" />
                    </button>

                    {!attendanceMeta.isSubscription &&
                      (attendanceMeta.effectiveCanDelete ||
                        attendanceMeta.effectiveDeleteDisabledReason) && (
                        <button
                          type="button"
                          disabled={!attendanceMeta.effectiveCanDelete}
                          onClick={(e) => {
                            e.stopPropagation();
                            if (attendanceMeta.effectiveCanDelete) {
                              onTriggerDelete(attendanceMeta.log);
                            }
                          }}
                          className="w-7 h-7 sm:w-7.5 sm:h-7.5 rounded-lg border border-slate-200/90 dark:border-white/10 flex items-center justify-center text-slate-600 dark:text-slate-300 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/80 shrink-0 cursor-pointer disabled:opacity-40 active:scale-95 transition-all touch-manipulation"
                          title="Remove record"
                        >
                          <Trash2 className="w-3.5 h-3.5 sm:w-4 sm:h-4 stroke-[2]" />
                        </button>
                      )}
                  </div>
                </div>
              </div>
            ) : (
              <>
                <div
                  className={`absolute left-0 top-0 bottom-0 w-1.5 ${attendanceMeta.theme.borderAccent}`}
                />

                <div className="flex items-center gap-2.5 sm:gap-4 w-full min-w-0 flex-1 pl-1.5">
                  {/* Left Column: Time & Icon */}
                  <div className="flex flex-col items-center justify-center shrink-0 select-none">
                    <span className="text-[9px] sm:text-[10px] font-mono font-bold text-slate-600 dark:text-slate-300 mb-1 leading-none tracking-tight">
                      {attendanceMeta.formattedInTime}
                    </span>
                    <div
                      className={`w-10 h-10 sm:w-11 sm:h-11 rounded-xl flex items-center justify-center relative border transition-transform duration-200 group-hover:scale-105 ${attendanceMeta.theme.iconBoxClass}`}
                    >
                      <CategoryIcon className="w-5 h-5 sm:w-5.5 sm:h-5.5 stroke-[2]" />

                      <div
                        className={`absolute -bottom-1 -right-1 w-4 h-4 rounded-full flex items-center justify-center text-white border border-white dark:border-slate-900 shadow-sm ${
                          attendanceMeta.isPaid ? 'bg-emerald-500' : 'bg-amber-500'
                        }`}
                      >
                        {attendanceMeta.isPaid ? (
                          <Check className="w-2.5 h-2.5 stroke-[3]" />
                        ) : (
                          <Clock className="w-2.5 h-2.5 stroke-[3]" />
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Center Info */}
                  <div className="min-w-0 flex-1 text-left space-y-1 py-0.5">
                    <div className="flex items-center gap-1.5 sm:gap-2 min-w-0 flex-wrap">
                      {attendanceMeta.entryCategory === 'card' &&
                      attendanceMeta.log.customerName.includes('others') ? (
                        <span className="font-mono text-[9px] sm:text-[10px] font-black text-amber-900 bg-amber-100 border-amber-300 dark:text-amber-200 dark:bg-amber-900/50 dark:border-amber-600 px-1.5 py-0.5 rounded border tracking-wider shrink-0">
                          BATCH
                        </span>
                      ) : attendanceMeta.log.memberId ? (
                        <span className="font-mono text-[9px] sm:text-[10px] font-bold text-slate-800 bg-slate-100 border-slate-300 dark:text-zinc-100 dark:bg-zinc-800 dark:border-zinc-600 px-1.5 py-0.5 rounded border tracking-wider shrink-0">
                          #{attendanceMeta.log.memberId}
                        </span>
                      ) : (
                        <span className="font-mono text-[8px] sm:text-[9px] font-bold text-slate-700 bg-slate-100 border-slate-300 dark:text-slate-300 dark:bg-slate-800 dark:border-slate-600 px-1.5 py-0.5 rounded border shrink-0">
                          GUEST
                        </span>
                      )}

                      <h4 className="text-xs sm:text-sm font-bold tracking-wide text-slate-900 dark:text-white uppercase truncate max-w-[150px] sm:max-w-md leading-tight">
                        {attendanceMeta.log.customerName}
                      </h4>

                      {/* Sync Status Indicator */}
                      {attendanceMeta.syncStatus === 'pending' ? (
                        <span
                          title="Pending Offline Sync (Secured in Encrypted Vault)"
                          className="inline-flex items-center gap-1 text-[8.5px] font-mono font-bold text-amber-800 bg-amber-50 dark:text-amber-300 dark:bg-amber-950/80 border border-amber-300 dark:border-amber-700 px-1.5 py-0.5 rounded shrink-0 animate-pulse"
                        >
                          <CloudOff className="w-2.5 h-2.5 stroke-[2.5]" />
                          <span>PENDING</span>
                        </span>
                      ) : attendanceMeta.syncStatus === 'conflict' ||
                        attendanceMeta.syncStatus === 'failed' ||
                        attendanceMeta.syncStatus === 'dropped' ? (
                        <span
                          title="Sync Failed or Dropped"
                          className="inline-flex items-center gap-1 text-[8.5px] font-mono font-bold text-rose-700 bg-rose-50 dark:text-rose-300 dark:bg-rose-950/80 border border-rose-300 dark:border-rose-700 px-1.5 py-0.5 rounded shrink-0"
                        >
                          <AlertCircle className="w-2.5 h-2.5 stroke-[2.5]" />
                          <span>FAILED</span>
                        </span>
                      ) : (
                        <span
                          title="Synced to Supabase"
                          className="inline-flex items-center text-emerald-600 dark:text-emerald-400 shrink-0"
                        >
                          <CheckCircle2 className="w-3.5 h-3.5 stroke-[2.5]" />
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span
                        className={`px-2 py-0.5 rounded-md text-[8.5px] sm:text-[9.5px] font-heading font-bold tracking-wider uppercase leading-none border inline-flex items-center gap-1 shrink-0 ${attendanceMeta.theme.badgeClass}`}
                      >
                        <CategoryIcon className="w-2.5 h-2.5 sm:w-3 sm:h-3 stroke-[2]" />
                        <span>{attendanceMeta.theme.label}</span>
                      </span>

                      <span
                        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[8.5px] sm:text-[9.5px] font-heading font-bold uppercase leading-none border shrink-0 ${attendanceMeta.paymentMethodInfo.badgeClass}`}
                      >
                        <PaymentIcon className="w-2.5 h-2.5 sm:w-3 sm:h-3 stroke-[2]" />
                        <span>{attendanceMeta.paymentMethodInfo.label}</span>
                      </span>
                    </div>
                  </div>

                  {/* Price & Actions */}
                  <div className="flex items-center gap-2 sm:gap-3 shrink-0 select-none pr-1">
                    {attendanceMeta.isSubscription ? (
                      /* Distinguished Subscription / Renewal Payment Badge */
                      <div className="flex items-center gap-2">
                        <div className="px-3 py-1 sm:px-3.5 sm:py-1.5 rounded-xl bg-emerald-500/10 dark:bg-emerald-500/15 border border-emerald-500/30 text-right">
                          <span className="text-[8px] sm:text-[8.5px] font-heading font-black tracking-widest text-emerald-600 dark:text-emerald-400 block uppercase leading-none">
                            PAID
                          </span>
                          <span className="text-xs sm:text-sm font-mono font-black text-emerald-600 dark:text-emerald-400 mt-0.5 block leading-tight">
                            ₱{attendanceMeta.log.amountPaid.toFixed(2)}
                          </span>
                        </div>
                      </div>
                    ) : (
                      /* Standard Entry Fee Calculation & Payment Action Toggle */
                      <>
                        <div className="text-right">
                          <span className="text-[8px] font-heading font-bold tracking-widest text-slate-500 dark:text-slate-400 block leading-none uppercase">
                            ENTRY FEE
                          </span>
                          <div className="flex items-center justify-end gap-1 mt-0.5 leading-none">
                            <span
                              className={`text-xs sm:text-sm font-mono font-black tracking-tight ${attendanceMeta.theme.priceTextClass}`}
                            >
                              ₱{attendanceMeta.log.amountPaid.toFixed(2)}
                            </span>
                          </div>
                          <span className="text-[8.5px] font-sans font-bold text-slate-500 dark:text-slate-400 hidden sm:block mt-0.5 max-w-[100px] truncate text-right">
                            ({attendanceMeta.planLabel})
                          </span>
                        </div>

                        {canDelete && attendanceMeta.log.amountPaid > 0 ? (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              if (attendanceMeta.isPaid) {
                                onTriggerUndoPayment?.(attendanceMeta.log);
                              } else {
                                onTriggerCollectPayment?.(attendanceMeta.log);
                              }
                            }}
                            className={`px-2.5 sm:px-3 py-1.5 rounded-lg text-[9px] sm:text-[10px] font-heading tracking-widest uppercase transition-all shrink-0 cursor-pointer font-bold border shadow-xs ${
                              attendanceMeta.isPaid
                                ? 'bg-emerald-50 text-emerald-800 border-emerald-300 dark:bg-emerald-950/80 dark:text-emerald-300 dark:border-emerald-500 hover:bg-rose-50 hover:text-rose-700 hover:border-rose-300'
                                : 'bg-amber-400 text-slate-950 border-amber-300 hover:bg-emerald-500 hover:text-white dark:bg-amber-500 animate-pulse'
                            }`}
                          >
                            {attendanceMeta.isPaid ? 'PAID' : 'COLLECT'}
                          </button>
                        ) : (
                          <div
                            title={
                              attendanceMeta.log.amountPaid <= 0
                                ? 'Free entry / zero balance record'
                                : undefined
                            }
                            className={`px-2.5 sm:px-3 py-1.5 rounded-lg text-[9px] sm:text-[10px] font-heading tracking-widest uppercase shrink-0 font-bold border select-none shadow-xs ${
                              attendanceMeta.log.amountPaid <= 0
                                ? 'bg-slate-100 text-slate-600 border-slate-300 dark:bg-zinc-800/80 dark:text-zinc-400 dark:border-zinc-700 cursor-not-allowed opacity-80'
                                : attendanceMeta.isPaid
                                  ? 'bg-emerald-50 text-emerald-800 border-emerald-300 dark:bg-emerald-950 dark:text-emerald-300 dark:border-emerald-500'
                                  : 'bg-rose-50 text-rose-700 border-rose-300 dark:bg-rose-950 dark:text-rose-300 dark:border-rose-500'
                            }`}
                          >
                            {attendanceMeta.log.amountPaid <= 0
                              ? 'FREE'
                              : attendanceMeta.isPaid
                                ? 'PAID'
                                : 'UNPAID'}
                          </div>
                        )}
                      </>
                    )}

                    <div className="hidden sm:flex items-center gap-1 pl-1">
                      <button
                        type="button"
                        disabled={!canPrint}
                        onClick={(e) => {
                          e.stopPropagation();
                          if (!canPrint) return;
                          onSelectReceipt(attendanceMeta.log);
                        }}
                        className={`p-1.5 rounded-lg transition-all border shrink-0 shadow-xs ${
                          !canPrint
                            ? 'opacity-40 cursor-not-allowed text-slate-400 border-slate-200 dark:border-zinc-800 dark:text-zinc-600'
                            : 'text-slate-600 hover:text-blue-600 hover:bg-blue-50 border-slate-200 hover:border-blue-300 dark:text-slate-300 dark:hover:text-blue-400 dark:hover:bg-blue-950/80 dark:border-slate-700 cursor-pointer'
                        }`}
                        title={
                          !canPrint
                            ? printDisabledReason ||
                              'Receipt viewing is disabled for closed sessions.'
                            : 'View Receipt'
                        }
                      >
                        <Printer className="w-4 h-4 stroke-[2]" />
                      </button>

                      {!attendanceMeta.isSubscription &&
                        (attendanceMeta.effectiveCanDelete ||
                          attendanceMeta.effectiveDeleteDisabledReason) && (
                          <button
                            type="button"
                            disabled={!attendanceMeta.effectiveCanDelete}
                            onClick={(e) => {
                              e.stopPropagation();
                              if (attendanceMeta.effectiveCanDelete) {
                                onTriggerDelete(attendanceMeta.log);
                              }
                            }}
                            className={`p-1.5 rounded-lg transition-all border shrink-0 shadow-xs ${
                              !attendanceMeta.effectiveCanDelete
                                ? 'opacity-40 cursor-not-allowed text-slate-400 border-slate-200 dark:border-zinc-800 dark:text-zinc-600'
                                : 'text-slate-600 hover:text-rose-600 hover:bg-rose-50 border-slate-200 hover:border-rose-300 dark:text-slate-300 dark:hover:text-rose-400 dark:hover:bg-rose-950/80 dark:border-slate-700 cursor-pointer'
                            }`}
                            title={
                              attendanceMeta.effectiveDeleteDisabledReason ||
                              'Remove this check-in'
                            }
                          >
                            <Trash2 className="w-4 h-4 stroke-[2]" />
                          </button>
                        )}
                    </div>
                  </div>
                </div>
              </>
            )}
          </>
        )}

        {/* SALE CARD */}
        {mode === 'sale' && saleMeta && (
          <>
            {viewMode === 'compact' ? (
              <>
                <div
                  className={`absolute left-0 top-0 bottom-0 w-1 ${saleMeta.theme.borderAccent}`}
                />
                <div className="flex items-center justify-between gap-2 sm:gap-3 w-full min-w-0 pl-1">
                  {/* Left & Center: Quantity Badge & 2-Tier Product Info Block */}
                  <div className="flex items-center gap-2.5 min-w-0 flex-1">
                    <div
                      className={`w-8 h-8 sm:w-8.5 sm:h-8.5 rounded-xl border flex items-center justify-center shrink-0 ${saleMeta.theme.iconBoxClass}`}
                    >
                      <span className="text-[10px] font-heading font-black">
                        {saleMeta.totalUnits}x
                      </span>
                    </div>

                    <div className="min-w-0 flex-1 flex flex-col justify-center">
                      <h4 className="text-xs sm:text-sm font-heading font-black text-slate-900 dark:text-white uppercase truncate tracking-wide">
                        {saleMeta.summaryHeader}
                      </h4>

                      {/* Line 2: Time, Payment & Items Summary */}
                      <div className="flex items-center gap-1.5 text-[10px] text-slate-500 dark:text-zinc-400 font-medium truncate mt-0.5">
                        <span className="font-mono text-[9px] text-slate-500 dark:text-zinc-400 font-bold shrink-0 flex items-center gap-0.5">
                          <Clock className="w-2.5 h-2.5 text-blue-500 dark:text-blue-400 shrink-0" />
                          <span>{saleMeta.formattedTime}</span>
                        </span>
                        <span className="text-slate-300 dark:text-zinc-700">•</span>
                        <span className="truncate">{saleMeta.tx.payment_method || 'Cash'}</span>
                        {saleMeta.tx.items && Array.isArray(saleMeta.tx.items) && saleMeta.tx.items.length > 0 && (
                          <>
                            <span className="hidden sm:inline-block text-slate-300 dark:text-zinc-700">•</span>
                            <span className="hidden sm:inline-block truncate">
                              {saleMeta.tx.items.length} item{saleMeta.tx.items.length > 1 ? 's' : ''}
                            </span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Right: Uniform Price & Big-Hitbox Action Buttons */}
                  <div className="flex items-center gap-1.5 sm:gap-2.5 shrink-0 justify-end">
                    <span
                      className={`text-xs sm:text-sm font-mono font-black min-w-[50px] sm:min-w-[60px] text-right ${saleMeta.theme.priceTextClass}`}
                    >
                      ₱{saleMeta.totalAmount.toFixed(2)}
                    </span>

                    {/* Outer-edge Action Buttons: Hidden on Mobile (Swipe Available), Visible on PC */}
                    <div className="hidden sm:flex items-center gap-1 sm:gap-1.5 shrink-0 sm:mr-0">
                      <button
                        type="button"
                        disabled={!canPrint}
                        onClick={(e) => {
                          e.stopPropagation();
                          if (!canPrint) return;
                          onSelectReceipt(saleMeta.tx);
                        }}
                        className="w-8.5 h-8.5 sm:w-8 sm:h-8 flex items-center justify-center rounded-lg border border-slate-200/90 dark:border-zinc-800 text-slate-500 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-950/80 dark:text-zinc-400 cursor-pointer disabled:opacity-30 touch-manipulation relative active:scale-95 transition-transform"
                        title="View Receipt"
                      >
                        <Printer className="w-3.5 h-3.5 pointer-events-none" />
                      </button>

                      {(canDelete || deleteDisabledReason) && (
                        <button
                          type="button"
                          disabled={!!deleteDisabledReason}
                          onClick={(e) => {
                            e.stopPropagation();
                            if (!deleteDisabledReason) {
                              onTriggerDelete(saleMeta.tx);
                            }
                          }}
                          className="w-8.5 h-8.5 sm:w-8 sm:h-8 flex items-center justify-center rounded-lg border border-slate-200/90 dark:border-zinc-800 text-slate-500 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/80 dark:text-zinc-400 cursor-pointer disabled:opacity-30 touch-manipulation relative active:scale-95 transition-transform"
                          title={deleteDisabledReason || 'Remove this sale'}
                        >
                          <Trash2 className="w-3.5 h-3.5 pointer-events-none" />
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </>
            ) : viewMode === 'grid' ? (
              <div className="flex flex-col justify-between w-full h-full pl-0.5 sm:pl-1">
                <div
                  className={`absolute left-0 top-0 bottom-0 w-1 sm:w-1.5 ${saleMeta.theme.borderAccent}`}
                />
                
                {/* Top Section: Header & Badges Container */}
                <div className="space-y-2">
                  {/* Header: Item Quantity Icon + Title & Time */}
                  <div className="flex items-start justify-between gap-1.5 pb-2 border-b border-slate-100 dark:border-white/5">
                    <div className="flex items-center gap-1.5 sm:gap-2.5 min-w-0 flex-1">
                      <div
                        className={`w-7 h-7 sm:w-9 sm:h-9 rounded-lg sm:rounded-xl border flex flex-col items-center justify-center shrink-0 transition-transform duration-200 group-hover:scale-105 ${saleMeta.theme.iconBoxClass}`}
                      >
                        <span className="text-[11px] sm:text-xs font-heading font-black leading-none">
                          {saleMeta.totalUnits}
                        </span>
                        <span className="text-[6px] sm:text-[7px] font-heading font-black uppercase tracking-widest leading-none mt-0.5">
                          PCS
                        </span>
                      </div>

                      <div className="min-w-0 flex-1 space-y-0.5">
                        <h4 className="text-[11px] sm:text-xs font-heading font-black tracking-wide text-slate-900 dark:text-white uppercase truncate">
                          {saleMeta.summaryHeader}
                        </h4>
                        <p className="text-[8.5px] sm:text-[9.5px] text-slate-500 dark:text-zinc-400 font-medium truncate">
                          {saleMeta.tx.items && Array.isArray(saleMeta.tx.items)
                            ? `${saleMeta.tx.items.length} item${saleMeta.tx.items.length > 1 ? 's' : ''}`
                            : 'Counter Sale'}
                        </p>
                      </div>
                    </div>

                    {/* Header Right: Floating Time Pill + Sync Indicator */}
                    <div className="flex items-center gap-1 shrink-0 pt-0.5">
                      <span className="inline-flex items-center gap-0.5 px-1.5 py-0.2 rounded-md bg-slate-100 dark:bg-zinc-800/90 border border-slate-200/90 dark:border-zinc-700 text-[7.5px] sm:text-[8.5px] font-mono font-bold text-slate-600 dark:text-slate-300 shadow-2xs">
                        <Clock className="w-2 h-2 text-blue-500 dark:text-blue-400 shrink-0" />
                        <span>{saleMeta.formattedTime}</span>
                      </span>

                      {saleMeta.syncStatus === 'pending' ? (
                        <span
                          title="Pending Offline Sync"
                          className="p-0.5 rounded bg-amber-50 dark:bg-amber-950/80 text-amber-600 dark:text-amber-400 border border-amber-300 dark:border-amber-700"
                        >
                          <CloudOff className="w-2.5 h-2.5 animate-pulse" />
                        </span>
                      ) : saleMeta.syncStatus === 'conflict' ||
                        saleMeta.syncStatus === 'failed' ||
                        saleMeta.syncStatus === 'dropped' ? (
                        <span
                          title="Sync Failed"
                          className="p-0.5 rounded bg-rose-50 dark:bg-rose-950/80 text-rose-600 dark:text-rose-400 border border-rose-300 dark:border-rose-700"
                        >
                          <AlertCircle className="w-2.5 h-2.5" />
                        </span>
                      ) : (
                        <CheckCircle2 className="w-3 h-3 text-emerald-600 dark:text-emerald-400" />
                      )}
                    </div>
                  </div>

                  {/* Card Body: Structured Payment Badge & Items Chips */}
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span
                      className={`px-1.5 sm:px-2 py-0.5 rounded text-[8px] sm:text-[8.5px] font-heading font-bold uppercase border inline-flex items-center gap-1 shrink-0 ${saleMeta.theme.badgeClass}`}
                    >
                      {saleMeta.isGCash ? (
                        <Wallet className="w-2.5 h-2.5 stroke-[2]" />
                      ) : (
                        <Banknote className="w-2.5 h-2.5 stroke-[2]" />
                      )}
                      <span>{saleMeta.tx.payment_method || 'Cash'}</span>
                    </span>

                    {saleMeta.tx.items && Array.isArray(saleMeta.tx.items) && (
                      saleMeta.tx.items.slice(0, 1).map((item: any, idx: number) => (
                        <span
                          key={idx}
                          className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-slate-100 dark:bg-zinc-800/80 text-slate-700 dark:text-zinc-300 border border-slate-200 dark:border-zinc-700 text-[8px] sm:text-[8.5px] font-sans font-bold shrink-0"
                        >
                          <span className={saleMeta.theme.priceTextClass}>
                            {item.quantity}x
                          </span>
                          <span className="truncate max-w-[65px]">
                            {item.productName || item.product_name}
                          </span>
                        </span>
                      ))
                    )}
                  </div>
                </div>

                {/* Card Footer: Scaled Financial Metric & Dedicated Actions Bar */}
                <div className="flex items-center justify-between gap-1.5 pt-2 border-t border-slate-100 dark:border-white/5 mt-auto">
                  <div className="min-w-0 pr-1">
                    <span className="text-[7.5px] sm:text-[8.5px] font-heading font-extrabold tracking-widest text-slate-400 block uppercase leading-none">
                      TOTAL SALE
                    </span>
                    <span
                      className={`text-sm sm:text-base font-mono font-black mt-0.5 block leading-tight ${saleMeta.theme.priceTextClass}`}
                    >
                      ₱{saleMeta.totalAmount.toFixed(2)}
                    </span>
                  </div>

                  <div className="flex items-center gap-1 sm:gap-1.5 shrink-0">
                    <button
                      type="button"
                      disabled={!canPrint}
                      onClick={(e) => {
                        e.stopPropagation();
                        if (!canPrint) return;
                        onSelectReceipt(saleMeta.tx);
                      }}
                      className="w-7 h-7 sm:w-7.5 sm:h-7.5 rounded-lg border border-slate-200/90 dark:border-white/10 flex items-center justify-center text-slate-600 dark:text-slate-300 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-950/80 shrink-0 cursor-pointer disabled:opacity-40 active:scale-95 transition-all touch-manipulation"
                      title="View Receipt"
                    >
                      <Printer className="w-3.5 h-3.5 sm:w-4 sm:h-4 stroke-[2]" />
                    </button>

                    {(canDelete || deleteDisabledReason) && (
                      <button
                        type="button"
                        disabled={!!deleteDisabledReason}
                        onClick={(e) => {
                          e.stopPropagation();
                          if (!deleteDisabledReason) {
                            onTriggerDelete(saleMeta.tx);
                          }
                        }}
                        className="w-7 h-7 sm:w-7.5 sm:h-7.5 rounded-lg border border-slate-200/90 dark:border-white/10 flex items-center justify-center text-slate-600 dark:text-slate-300 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/80 shrink-0 cursor-pointer disabled:opacity-40 active:scale-95 transition-all touch-manipulation"
                        title={deleteDisabledReason || 'Remove this sale'}
                      >
                        <Trash2 className="w-3.5 h-3.5 sm:w-4 sm:h-4 stroke-[2]" />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ) : (
              <>
                <div
                  className={`absolute left-0 top-0 bottom-0 w-1.5 ${saleMeta.theme.borderAccent}`}
                />

                <div className="flex items-center gap-3 sm:gap-4 w-full min-w-0 flex-1 pl-1.5">
                  <div className="flex flex-col items-center justify-center shrink-0 select-none">
                    <span className="text-[9px] sm:text-[10px] font-mono font-bold text-slate-600 dark:text-slate-300 mb-1 leading-none tracking-tight">
                      {saleMeta.formattedTime}
                    </span>
                    <div
                      className={`w-10 h-10 sm:w-11 sm:h-11 rounded-xl border flex flex-col items-center justify-center ${saleMeta.theme.iconBoxClass}`}
                    >
                      <span className="text-xs sm:text-sm font-heading font-bold leading-none">
                        {saleMeta.totalUnits}
                      </span>
                      <span className="text-[7.5px] font-heading font-bold uppercase tracking-widest leading-none mt-0.5">
                        PCS
                      </span>
                    </div>
                  </div>

                  <div className="min-w-0 flex-1 text-left space-y-1">
                    <div className="flex items-center gap-2 flex-wrap min-w-0">
                      <h4 className="text-xs sm:text-sm font-heading font-bold tracking-wide text-slate-900 dark:text-white uppercase truncate max-w-[200px] sm:max-w-md leading-tight">
                        {saleMeta.summaryHeader}
                      </h4>

                      {/* Sync Status Indicator */}
                      {saleMeta.syncStatus === 'pending' ? (
                        <span
                          title="Pending Offline Sync (Secured in Encrypted Vault)"
                          className="inline-flex items-center gap-1 text-[8.5px] font-mono font-bold text-amber-800 bg-amber-50 dark:text-amber-300 dark:bg-amber-950/80 border border-amber-300 dark:border-amber-700 px-1.5 py-0.5 rounded shrink-0 animate-pulse"
                        >
                          <CloudOff className="w-2.5 h-2.5 stroke-[2.5]" />
                          <span>PENDING</span>
                        </span>
                      ) : saleMeta.syncStatus === 'conflict' ||
                        saleMeta.syncStatus === 'failed' ||
                        saleMeta.syncStatus === 'dropped' ? (
                        <span
                          title="Sync Failed or Dropped"
                          className="inline-flex items-center gap-1 text-[8.5px] font-mono font-bold text-rose-700 bg-rose-50 dark:text-rose-300 dark:bg-rose-950/80 border border-rose-300 dark:border-rose-700 px-1.5 py-0.5 rounded shrink-0"
                        >
                          <AlertCircle className="w-2.5 h-2.5 stroke-[2.5]" />
                          <span>FAILED</span>
                        </span>
                      ) : (
                        <span
                          title="Synced to Supabase"
                          className="inline-flex items-center text-emerald-600 dark:text-emerald-400 shrink-0"
                        >
                          <CheckCircle2 className="w-3.5 h-3.5 stroke-[2.5]" />
                        </span>
                      )}

                      <span
                        className={`px-2 py-0.5 rounded-md text-[10px] font-heading font-bold tracking-wider uppercase leading-none border inline-flex items-center gap-1 shrink-0 ${saleMeta.theme.badgeClass}`}
                      >
                        {saleMeta.isGCash ? (
                          <Wallet className="w-3 h-3 stroke-[2]" />
                        ) : (
                          <Banknote className="w-3 h-3 stroke-[2]" />
                        )}
                        <span>{saleMeta.tx.payment_method || 'Cash'}</span>
                      </span>
                    </div>

                    <div className="flex flex-wrap gap-1">
                      {saleMeta.tx.items && Array.isArray(saleMeta.tx.items) ? (
                        saleMeta.tx.items.map((item: any, idx: number) => (
                          <span
                            key={idx}
                            className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-slate-50 text-slate-800 border-slate-200/90 dark:bg-slate-800 dark:text-slate-200 dark:border-slate-700 text-[10px] font-sans font-bold border shrink-0"
                          >
                            <span
                              className={`font-heading font-bold text-[10px] ${saleMeta.theme.priceTextClass}`}
                            >
                              {item.quantity}x
                            </span>
                            <span className="truncate">
                              {item.productName || item.product_name}
                            </span>
                          </span>
                        ))
                      ) : (
                        <div className="text-xs text-slate-700 dark:text-slate-300 truncate font-sans font-semibold">
                          {saleMeta.tx.product_name || saleMeta.tx.productName}
                        </div>
                      )}
                    </div>

                    {(saleMeta.changeCalculated > 0 ||
                      saleMeta.gcashFeeApplied > 0) && (
                      <div className="text-[10px] text-slate-600 dark:text-slate-300 font-mono flex items-center gap-2 flex-wrap pt-0.5">
                        {saleMeta.changeCalculated > 0 && (
                          <span className="font-bold text-emerald-600 dark:text-emerald-400">
                            CHANGE: ₱{saleMeta.changeCalculated.toFixed(2)}
                          </span>
                        )}
                        {saleMeta.gcashFeeApplied > 0 && (
                          <span className="text-sky-600 dark:text-sky-400 font-bold">
                            +₱{saleMeta.gcashFeeApplied.toFixed(2)} FEE
                          </span>
                        )}
                      </div>
                    )}
                  </div>

                  <div className="flex items-center gap-2 shrink-0 select-none pr-1">
                    <div className="text-right">
                      <span className="text-[8px] font-heading font-bold tracking-widest text-slate-500 dark:text-slate-400 block leading-none uppercase">
                        TOTAL SALE
                      </span>
                      <div className="flex items-center justify-end gap-1 mt-0.5 leading-none">
                        <span
                          className={`text-xs sm:text-sm font-mono font-black tracking-tight ${saleMeta.theme.priceTextClass}`}
                        >
                          ₱{saleMeta.totalAmount.toFixed(2)}
                        </span>
                      </div>
                    </div>

                    <div className="hidden sm:flex items-center gap-1 pl-1">
                      <button
                        type="button"
                        disabled={!canPrint}
                        onClick={(e) => {
                          e.stopPropagation();
                          if (!canPrint) return;
                          onSelectReceipt(saleMeta.tx);
                        }}
                        className={`p-1.5 rounded-lg transition-all border shrink-0 shadow-xs ${
                          !canPrint
                            ? 'opacity-40 cursor-not-allowed text-slate-400 border-slate-200 dark:border-zinc-800 dark:text-zinc-600'
                            : 'text-slate-600 hover:text-blue-600 hover:bg-blue-50 border-slate-200 hover:border-blue-300 dark:text-slate-300 dark:hover:text-blue-400 dark:hover:bg-blue-950/80 dark:border-slate-700 cursor-pointer'
                        }`}
                        title={
                          !canPrint
                            ? printDisabledReason ||
                              'Receipt viewing is disabled for closed sessions.'
                            : 'View Receipt'
                        }
                      >
                        <Printer className="w-4 h-4 stroke-[2]" />
                      </button>

                      {(canDelete || deleteDisabledReason) && (
                        <button
                          type="button"
                          disabled={!!deleteDisabledReason}
                          onClick={(e) => {
                            e.stopPropagation();
                            if (!deleteDisabledReason) {
                              onTriggerDelete(saleMeta.tx);
                            }
                          }}
                          className={`p-1.5 rounded-lg transition-all border shrink-0 shadow-xs ${
                            deleteDisabledReason
                              ? 'opacity-40 cursor-not-allowed text-slate-400 border-slate-200 dark:border-zinc-800 dark:text-zinc-600'
                              : 'text-slate-600 hover:text-rose-600 hover:bg-rose-50 border-slate-200 hover:border-rose-300 dark:text-slate-300 dark:hover:text-rose-400 dark:hover:bg-rose-950/80 dark:border-slate-700 cursor-pointer'
                          }`}
                          title={deleteDisabledReason || 'Remove this sale'}
                        >
                          <Trash2 className="w-4 h-4 stroke-[2]" />
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </>
            )}
          </>
        )}
      </motion.div>
    </div>
  );
};

export const TimelineCard = React.memo(TimelineCardComponent);