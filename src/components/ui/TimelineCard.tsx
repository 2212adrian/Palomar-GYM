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
  Banknote,
  Wallet,
  Gift
} from 'lucide-react';

export interface LogRecord {
  id: string;
  timestamp: string;
  checkOutTime?: string;
  memberId: string | null;
  customerName: string;
  customerType: 'Walk-In' | 'Existing Member' | 'New Membership';
  categoryOrPlan: string;
  paymentMethod: 'Cash' | 'GCash' | 'Free' | string;
  amountPaid: number;
  paymentStatus: 'Paid' | 'Free' | 'Unpaid';
  status: 'Active' | 'Expires Soon' | 'Expired' | 'Suspended';
  isSubscription?: boolean;
}

export interface SaleRecord {
  id: string;
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
}

interface TimelineCardProps {
  mode: 'attendance' | 'sale';
  data: any; // Can be cast as LogRecord or SaleRecord
  canDelete: boolean;
  onSelectReceipt: (data: any) => void;
  onTriggerDelete: (data: any) => void;
  // Attendance-specific action triggers
  onTriggerCollectPayment?: (data: any) => void;
  onTriggerUndoPayment?: (data: any) => void;
  onDragEnd: (_event: any, info: any, data: any) => void;
}

export type EntryCategory = 'walkin_student' | 'walkin_regular' | 'member' | 'new_subscription';

export const getEntryCategory = (log: LogRecord): EntryCategory => {
  const cType = log.customerType;
  const plan = (log.categoryOrPlan || '').toLowerCase();

  // New Membership / Subscription contract check
  if (
    cType === 'New Membership' ||
    log.isSubscription ||
    plan.includes('new membership') ||
    plan.includes('subscription')
  ) {
    return 'new_subscription';
  }

  // Existing Member check
  if (cType === 'Existing Member' || (cType as string) === 'Member') {
    return 'member';
  }

  // Walk-In check: Student vs Regular
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
      badgeClass: 'bg-sky-500/20 text-sky-700 dark:text-sky-300 border-sky-500/40 font-bold'
    };
  }
  if (normalized.includes('cash')) {
    return {
      type: 'cash',
      label: 'Cash',
      icon: Banknote,
      badgeClass: 'bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 border-emerald-500/40 font-bold'
    };
  }
  return {
    type: 'free',
    label: 'Free',
    icon: Gift,
    badgeClass: 'bg-slate-500/20 text-slate-700 dark:text-slate-300 border-slate-500/40 font-bold'
  };
};

const CATEGORY_THEMES = {
  walkin_student: {
    label: 'STUDENT WALK-IN',
    shortLabel: 'STUDENT',
    icon: GraduationCap,
    bgClass: 'bg-cyan-100/95 dark:bg-[#072a32] hover:bg-cyan-100 dark:hover:bg-[#09333d] border-cyan-300 dark:border-cyan-800/80 shadow-2xs',
    borderAccent: 'bg-cyan-500',
    badgeClass: 'bg-cyan-500/25 text-cyan-800 dark:text-cyan-300 border-cyan-500/40 font-bold',
    iconBoxClass: 'bg-cyan-500/20 text-cyan-600 dark:text-cyan-300 border-cyan-500/30',
    priceTextClass: 'text-cyan-600 dark:text-cyan-400',
  },
  walkin_regular: {
    label: 'REGULAR WALK-IN',
    shortLabel: 'REGULAR',
    icon: User,
    bgClass: 'bg-purple-100/95 dark:bg-[#200b30] hover:bg-purple-100 dark:hover:bg-[#280e3d] border-purple-300 dark:border-purple-800/80 shadow-2xs',
    borderAccent: 'bg-purple-500',
    badgeClass: 'bg-purple-500/25 text-purple-800 dark:text-purple-300 border-purple-500/40 font-bold',
    iconBoxClass: 'bg-purple-500/20 text-purple-600 dark:text-purple-300 border-purple-500/30',
    priceTextClass: 'text-purple-600 dark:text-purple-400',
  },
  member: {
    label: 'EXISTING MEMBER',
    shortLabel: 'MEMBER',
    icon: ShieldCheck,
    bgClass: 'bg-blue-100/95 dark:bg-[#0a1e3f] hover:bg-blue-100 dark:hover:bg-[#0d2752] border-blue-300 dark:border-blue-800/80 shadow-2xs',
    borderAccent: 'bg-blue-500',
    badgeClass: 'bg-blue-500/25 text-blue-800 dark:text-blue-300 border-blue-500/40 font-bold',
    iconBoxClass: 'bg-blue-500/20 text-blue-600 dark:text-blue-300 border-blue-500/30',
    priceTextClass: 'text-blue-600 dark:text-blue-400',
  },
  new_subscription: {
    label: 'NEW MEMBERSHIP',
    shortLabel: 'SUBSCRIPTION',
    icon: Crown,
    bgClass: 'bg-emerald-100/95 dark:bg-[#062c1e] hover:bg-emerald-100 dark:hover:bg-[#083a28] border-emerald-300 dark:border-emerald-800/80 shadow-2xs',
    borderAccent: 'bg-emerald-500',
    badgeClass: 'bg-emerald-500/25 text-emerald-800 dark:text-emerald-300 border-emerald-500/40 font-bold',
    iconBoxClass: 'bg-emerald-500/20 text-emerald-600 dark:text-emerald-300 border-emerald-500/30',
    priceTextClass: 'text-emerald-600 dark:text-emerald-400',
  }
};

const TimelineCardComponent: React.FC<TimelineCardProps> = ({
  mode,
  data,
  canDelete,
  onSelectReceipt,
  onTriggerDelete,
  onTriggerCollectPayment,
  onTriggerUndoPayment,
  onDragEnd,
}) => {
  const x = useMotionValue(0);

  // High-performance direct transforms
  const receiptOpacity = useTransform(x, [15, 60], [0, 1]);
  const removeOpacity = useTransform(x, [-60, -15], [1, 0]);

  // --- ATTENDANCE MODE DERIVED VARIABLES ---
  const attendanceMeta = useMemo(() => {
    if (mode !== 'attendance') return null;
    const log = data as LogRecord;
    const entryCategory = getEntryCategory(log);
    const theme = CATEGORY_THEMES[entryCategory];
    const paymentMethodInfo = getPaymentMethodInfo(log.paymentMethod);
    const isPaid = log.paymentStatus === 'Paid' || log.paymentStatus === 'Free';
    const formattedInTime = log.timestamp ? format(parseISO(log.timestamp), 'hh:mm a') : 'N/A';
    const planLabel = log.categoryOrPlan.replace('Pass', '').replace('Membership', '').trim() || log.categoryOrPlan;

    return { 
      log, 
      entryCategory, 
      theme, 
      paymentMethodInfo, 
      isPaid, 
      formattedInTime, 
      planLabel 
    };
  }, [mode, data]);

  // --- SALE MODE DERIVED VARIABLES ---
  const saleMeta = useMemo(() => {
    if (mode !== 'sale') return null;
    const tx = data as SaleRecord;
    const totalUnits = tx.quantity || tx.items?.reduce((sum: number, i: any) => sum + i.quantity, 0) || 1;
    const formattedTime = tx.created_at || tx.createdAt ? format(parseISO(tx.created_at || tx.createdAt || ''), 'hh:mm a') : 'N/A';
    const summaryHeader = tx.items && tx.items.length > 0
      ? (tx.items[0].productName || tx.items[0].product_name) + (tx.items.length > 1 ? ` & ${tx.items.length - 1} other item${tx.items.length - 1 > 1 ? 's' : ''}` : '')
      : (tx.product_name || tx.productName || 'Sales Transaction');
    
    const paymentMethodStr = (tx.payment_method || '').toLowerCase();
    const isGCash = paymentMethodStr.includes('gcash');
    const isCash = paymentMethodStr.includes('cash');

    const theme = isGCash
      ? {
          type: 'gcash',
          bgClass: 'bg-sky-100/95 dark:bg-[#072138] hover:bg-sky-100 dark:hover:bg-[#092947] border-sky-300 dark:border-sky-800/80 shadow-2xs',
          borderAccent: 'bg-sky-500',
          badgeClass: 'bg-sky-500/25 text-sky-800 dark:text-sky-300 border-sky-500/40 font-bold',
          iconBoxClass: 'bg-sky-500/20 text-sky-600 dark:text-sky-300 border-sky-500/30',
          priceTextClass: 'text-sky-600 dark:text-sky-400',
        }
      : isCash
      ? {
          type: 'cash',
          bgClass: 'bg-emerald-100/95 dark:bg-[#062c1e] hover:bg-emerald-100 dark:hover:bg-[#083a28] border-emerald-300 dark:border-emerald-800/80 shadow-2xs',
          borderAccent: 'bg-emerald-500',
          badgeClass: 'bg-emerald-500/25 text-emerald-800 dark:text-emerald-300 border-emerald-500/40 font-bold',
          iconBoxClass: 'bg-emerald-500/20 text-emerald-600 dark:text-emerald-300 border-emerald-500/30',
          priceTextClass: 'text-emerald-600 dark:text-emerald-400',
        }
      : {
          type: 'other',
          bgClass: 'bg-slate-100/95 dark:bg-[#1e293b] hover:bg-slate-100 dark:hover:bg-[#283548] border-slate-300 dark:border-slate-700/80 shadow-2xs',
          borderAccent: 'bg-slate-500',
          badgeClass: 'bg-slate-500/25 text-slate-800 dark:text-slate-300 border-slate-500/40 font-bold',
          iconBoxClass: 'bg-slate-500/20 text-slate-600 dark:text-slate-300 border-slate-500/30',
          priceTextClass: 'text-slate-600 dark:text-slate-400',
        };

    const refNumber = tx.reference_number;
    const receivedAmount = Number(tx.amount_received || 0);
    const totalAmount = Number(tx.total_amount || tx.totalAmount || 0);
    const changeCalculated = Number(tx.change_calculated || 0);
    const gcashFeeApplied = Number(tx.gcash_fee_applied || 0);

    return { tx, totalUnits, formattedTime, summaryHeader, isGCash, isCash, theme, refNumber, receivedAmount, totalAmount, changeCalculated, gcashFeeApplied };
  }, [mode, data]);

  const containerClasses = useMemo(() => {
    if (mode === 'attendance' && attendanceMeta) {
      return `pointer-events-auto flex items-stretch relative overflow-hidden select-none z-10 touch-pan-y min-h-[76px] sm:min-h-[82px] w-full group rounded-2xl border transition-colors duration-200 ${attendanceMeta.theme.bgClass}`;
    }
    if (mode === 'sale' && saleMeta) {
      return `pointer-events-auto flex items-stretch relative overflow-hidden select-none z-10 touch-pan-y min-h-[80px] sm:min-h-[86px] w-full group rounded-2xl border transition-colors duration-200 ${saleMeta.theme.bgClass} p-3 sm:p-4`;
    }
    return 'pointer-events-auto bg-white dark:bg-zinc-900 border border-(--border-color) rounded-2xl p-4 sm:p-5 shadow-sm hover:shadow-md transition-shadow flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4 relative overflow-hidden select-none z-10 touch-pan-y w-full';
  }, [mode, attendanceMeta, saleMeta]);

  const CategoryIcon = attendanceMeta?.theme.icon || User;
  const PaymentIcon = attendanceMeta?.paymentMethodInfo.icon || Banknote;

  return (
    <div className="relative overflow-hidden rounded-2xl w-full shadow-2xs">
      {/* Swipe reveal background tracks */}
      <div className="absolute inset-0 rounded-2xl pointer-events-none select-none z-0 overflow-hidden bg-slate-900">
        <motion.div 
          style={{ opacity: receiptOpacity }}
          className="absolute inset-y-0 left-0 bg-blue-600 dark:bg-blue-700 flex items-center pl-6 text-white text-[10px] font-heading tracking-wider font-extrabold w-1/2"
        >
          RECEIPT
        </motion.div>
        
        <motion.div 
          style={{ opacity: removeOpacity }}
          className="absolute inset-y-0 right-0 bg-rose-600 dark:bg-rose-700 flex items-center justify-end pr-6 text-white text-[10px] font-heading tracking-wider font-extrabold w-1/2"
        >
          REMOVE
        </motion.div>
      </div>

      {/* Opaque sliding card cover element */}
      <motion.div
        style={{ x }}
        drag="x"
        dragDirectionLock={true}
        dragConstraints={{ left: -100, right: 100 }}
        dragElastic={0.15}
        dragSnapToOrigin={true}
        onDragEnd={(e, info) => onDragEnd(e, info, data)}
        className={containerClasses}
      >
        {/* =========================================
            LAYOUT A: ATTENDANCE RENDERING MODULE
            ========================================= */}
        {mode === 'attendance' && attendanceMeta && (
          <>
            {/* Thick Left Edge Color Bar */}
            <div className={`absolute left-0 top-0 bottom-0 w-1.5 ${attendanceMeta.theme.borderAccent}`} />

            {/* Left status / category icon column */}
            <div className="w-16 sm:w-20 flex items-center justify-center relative shrink-0 pl-1.5">
              <div className={`w-10 h-10 sm:w-11 sm:h-11 rounded-xl flex items-center justify-center relative border transition-transform duration-200 group-hover:scale-105 ${attendanceMeta.theme.iconBoxClass}`}>
                <CategoryIcon className="w-5 h-5 sm:w-5.5 sm:h-5.5" />
                
                {/* Payment status badge indicator dot */}
                <div className={`absolute -bottom-1 -right-1 w-4 h-4 rounded-full flex items-center justify-center text-white border-2 border-white dark:border-zinc-900 shadow-2xs ${
                  attendanceMeta.isPaid ? 'bg-emerald-500' : 'bg-amber-500'
                }`}>
                  {attendanceMeta.isPaid ? (
                    <Check className="w-2.5 h-2.5 stroke-[3]" />
                  ) : (
                    <Clock className="w-2.5 h-2.5 stroke-[3]" />
                  )}
                </div>
              </div>
            </div>

            {/* Core details block */}
            <div className="flex-1 min-w-0 py-2.5 px-2 sm:px-3 flex flex-col justify-center gap-1">
              <div className="flex items-center gap-2 flex-wrap min-w-0">
                <h4 className="text-xs sm:text-sm font-heading font-black tracking-wide text-(--color-text) uppercase truncate max-w-[180px] sm:max-w-xs leading-tight">
                  {attendanceMeta.log.customerName}
                </h4>

                {attendanceMeta.log.memberId && (
                  <span className="font-mono text-[9px] font-bold text-slate-500 dark:text-slate-400 bg-slate-200/60 dark:bg-zinc-800 px-1.5 py-0.5 rounded border border-(--border-color)/60">
                    #{attendanceMeta.log.memberId}
                  </span>
                )}

                {/* Distinct Category Pill */}
                <span className={`px-2 py-0.5 rounded-md text-[8px] font-heading font-black tracking-wider uppercase leading-none border inline-flex items-center gap-1 shrink-0 ${attendanceMeta.theme.badgeClass}`}>
                  <CategoryIcon className="w-3 h-3" />
                  <span>{attendanceMeta.theme.label}</span>
                </span>
              </div>

              {/* Time & Payment Method Row */}
              <div className="flex items-center gap-2 flex-wrap text-[10px]">
                <span className="inline-flex items-center gap-1 font-mono font-bold text-slate-500 dark:text-slate-400">
                  <Clock className="w-3 h-3 text-slate-400" />
                  IN: {attendanceMeta.formattedInTime}
                </span>

                <span className="text-slate-300 dark:text-zinc-700">•</span>

                {/* Payment Method Badge */}
                <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[8px] font-heading font-black uppercase border leading-none ${attendanceMeta.paymentMethodInfo.badgeClass}`}>
                  <PaymentIcon className="w-3 h-3" />
                  <span>{attendanceMeta.paymentMethodInfo.label}</span>
                </span>
              </div>
            </div>

            {/* Pricing highlight & action badge */}
            <div className="flex items-center gap-2 sm:gap-3 shrink-0 select-none pr-3 py-2">
              <div className="text-right">
                <span className="text-[8px] font-heading font-bold tracking-widest text-slate-400 block leading-none uppercase">ENTRY FEE</span>
                <div className="flex items-center justify-end gap-1 mt-1 leading-none">
                  <span className={`text-xs sm:text-base font-heading font-black tracking-wide ${attendanceMeta.theme.priceTextClass}`}>
                    ₱{attendanceMeta.log.amountPaid.toFixed(2)}
                  </span>
                </div>
                <span className="text-[8px] font-sans font-bold text-slate-400 dark:text-slate-500 block mt-0.5 max-w-[100px] truncate text-right">
                  ({attendanceMeta.planLabel})
                </span>
              </div>

              {canDelete ? (
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
                  className={`px-3 py-1.5 rounded-xl text-[8px] font-heading tracking-widest uppercase transition-all shrink-0 cursor-pointer font-extrabold border ${
                    attendanceMeta.isPaid
                      ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20 hover:bg-rose-500/10 hover:text-rose-500 hover:border-rose-500/20'
                      : 'bg-amber-500/20 text-amber-600 dark:text-amber-400 border-amber-500/30 hover:bg-emerald-500/20 hover:text-emerald-600 animate-pulse'
                  }`}
                >
                  {attendanceMeta.isPaid ? 'PAID' : 'COLLECT'}
                </button>
              ) : (
                <div className={`px-3 py-1.5 rounded-xl text-[8px] font-heading tracking-widest uppercase shrink-0 font-extrabold border select-none ${
                  attendanceMeta.isPaid
                    ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20'
                    : 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20'
                }`}>
                  {attendanceMeta.isPaid ? 'PAID' : 'UNPAID'}
                </div>
              )}
            </div>
          </>
        )}

        {/* =========================================
            LAYOUT B: SALE RENDERING MODULE
            ========================================= */}
        {mode === 'sale' && saleMeta && (
          <>
            {/* Thick Left Edge Color Bar */}
            <div className={`absolute left-0 top-0 bottom-0 w-1.5 ${saleMeta.theme.borderAccent}`} />

            {/* Absolute indicator for reference/received value */}
            <div className="absolute top-2.5 right-4 hidden sm:block text-[9px] font-mono font-bold text-slate-500 dark:text-slate-400 whitespace-nowrap">
              {saleMeta.isGCash ? (
                saleMeta.refNumber ? `REF: ${saleMeta.refNumber}` : 'GCASH PAYMENT'
              ) : (
                `RECEIVED: ₱${saleMeta.receivedAmount.toFixed(2)}`
              )}
            </div>

            <div className="flex items-center gap-3 sm:gap-4 w-full min-w-0 flex-1 pl-1 sm:pl-1.5">
              {/* Left indicator column: PCS counts */}
              <div className="flex flex-col items-center justify-center shrink-0 select-none">
                <div className={`w-11 h-11 sm:w-12 sm:h-12 rounded-xl border flex flex-col items-center justify-center ${saleMeta.theme.iconBoxClass}`}>
                  <span className="text-[13px] sm:text-[14px] font-heading font-black leading-none">{saleMeta.totalUnits}</span>
                  <span className="text-[7.5px] sm:text-[8px] font-heading font-extrabold uppercase tracking-widest leading-none mt-1">PCS</span>
                </div>
              </div>

              {/* Core metadata blocks */}
              <div className="min-w-0 flex-1 text-left space-y-1">
                <div className="flex items-center gap-2 flex-wrap min-w-0">
                  <h4 className="text-xs sm:text-sm font-heading font-black tracking-wide text-(--color-text) uppercase truncate max-w-[200px] sm:max-w-xs leading-tight">
                    {saleMeta.summaryHeader}
                  </h4>
                  
                  <span className="text-[9px] font-mono font-bold px-2 py-0.5 rounded-md bg-slate-200/60 dark:bg-zinc-800 text-slate-600 dark:text-slate-300 border border-(--border-color)/60 shrink-0">
                    {saleMeta.tx.receipt_no}
                  </span>

                  {/* Payment Method Badge */}
                  <span className={`px-2 py-0.5 rounded-md text-[8px] font-heading font-black tracking-wider uppercase leading-none border inline-flex items-center gap-1 shrink-0 ${saleMeta.theme.badgeClass}`}>
                    {saleMeta.isGCash ? <Wallet className="w-3 h-3" /> : <Banknote className="w-3 h-3" />}
                    <span>{saleMeta.tx.payment_method || 'Cash'}</span>
                  </span>
                </div>

                {/* Sub-items block listing */}
                <div className="flex flex-wrap gap-1.5">
                  {saleMeta.tx.items && Array.isArray(saleMeta.tx.items) ? (
                    saleMeta.tx.items.map((item: any, idx: number) => (
                      <span 
                        key={idx} 
                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-slate-200/50 dark:bg-zinc-800/80 text-[9.5px] font-sans font-bold text-slate-700 dark:text-slate-300 border border-(--border-color)/50 max-w-45 shrink-0"
                      >
                        <span className={`font-heading font-black text-[9px] ${saleMeta.theme.priceTextClass}`}>
                          {item.quantity}x
                        </span>
                        <span className="truncate">{item.productName || item.product_name}</span>
                      </span>
                    ))
                  ) : (
                    <div className="text-xs text-slate-600 dark:text-slate-400 truncate font-sans font-medium">
                      {saleMeta.tx.product_name || saleMeta.tx.productName}
                    </div>
                  )}
                </div>

                {/* Extended timestamps / status lines */}
                <div className="text-[10px] text-slate-500 dark:text-slate-400 font-mono flex items-center gap-1.5 flex-wrap pt-0.5">
                  <span className="inline-flex items-center gap-1 font-bold">
                    <Clock className="w-3 h-3 text-slate-400" />
                    TIME: {saleMeta.formattedTime}
                  </span>
                  {saleMeta.changeCalculated > 0 && (
                    <>
                      <span className="text-slate-300 dark:text-zinc-700">•</span>
                      <span className="font-bold">CHANGE: ₱{saleMeta.changeCalculated.toFixed(2)}</span>
                    </>
                  )}
                  {saleMeta.gcashFeeApplied > 0 && (
                    <>
                      <span className="text-slate-300 dark:text-zinc-700">•</span>
                      <span className="text-sky-600 dark:text-sky-400 font-bold">+₱{saleMeta.gcashFeeApplied.toFixed(2)} FEE</span>
                    </>
                  )}
                </div>
              </div>

              {/* Pricing highlight & Action Column */}
              <div className="flex items-center gap-2 sm:gap-3 shrink-0 select-none pr-1">
                <div className="text-right">
                  <span className="text-[8px] font-heading font-bold tracking-widest text-slate-400 block leading-none uppercase">TOTAL SALE</span>
                  <div className="flex items-center justify-end gap-1 mt-1 leading-none">
                    <span className={`text-xs sm:text-base font-heading font-black tracking-wide ${saleMeta.theme.priceTextClass}`}>
                      ₱{saleMeta.totalAmount.toFixed(2)}
                    </span>
                  </div>
                </div>

                {/* Action icons */}
                <div className="hidden sm:flex items-center gap-1 pl-1">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onSelectReceipt(saleMeta.tx);
                    }}
                    className="p-2 text-slate-500 hover:text-blue-500 dark:text-slate-400 dark:hover:text-blue-400 hover:bg-blue-500/10 rounded-xl transition-all border border-transparent hover:border-blue-500/20 cursor-pointer shrink-0"
                    title="View Receipt"
                  >
                    <Printer className="w-4 h-4" />
                  </button>

                  {canDelete && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onTriggerDelete(saleMeta.tx);
                      }}
                      className="p-2 text-slate-500 hover:text-rose-500 dark:text-slate-400 dark:hover:text-rose-400 hover:bg-rose-500/10 rounded-xl transition-all border border-transparent hover:border-rose-500/20 cursor-pointer shrink-0"
                      title="Remove this sale"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>
            </div>
          </>
        )}
      </motion.div>
    </div>
  );
};

export const TimelineCard = React.memo(TimelineCardComponent);