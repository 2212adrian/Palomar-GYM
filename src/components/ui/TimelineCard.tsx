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
  paymentMethod: 'Cash' | 'GCash' | 'Promo' | string;
  amountPaid: number;
  paymentStatus: 'Paid' | 'Promo' | 'Unpaid';
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
  data: any;
  canDelete: boolean;
  onSelectReceipt: (data: any) => void;
  onTriggerDelete: (data: any) => void;
  onTriggerCollectPayment?: (data: any) => void;
  onTriggerUndoPayment?: (data: any) => void;
  onDragEnd: (_event: any, info: any, data: any) => void;
}

export type EntryCategory = 'walkin_student' | 'walkin_regular' | 'member' | 'new_subscription';

export const getEntryCategory = (log: LogRecord): EntryCategory => {
  const cType = log.customerType;
  const plan = (log.categoryOrPlan || '').toLowerCase();

  if (
    cType === 'New Membership' ||
    log.isSubscription ||
    plan.includes('new membership') ||
    plan.includes('subscription')
  ) {
    return 'new_subscription';
  }

  if (cType === 'Existing Member' || (cType as string) === 'Member') {
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
      badgeClass: 'bg-blue-50 text-blue-900 border-blue-300 dark:bg-blue-900/80 dark:text-blue-200 dark:border-blue-500 font-bold tracking-wider'
    };
  }
  
  if (normalized.includes('cash')) {
    return {
      type: 'cash',
      label: 'Cash',
      icon: Banknote,
      badgeClass: 'bg-emerald-50 text-emerald-900 border-emerald-300 dark:bg-emerald-900/80 dark:text-emerald-200 dark:border-emerald-500 font-bold tracking-wider'
    };
  }
  
  return {
    type: 'Promo',
    label: 'Promo',
    icon: Gift,
    badgeClass: 'bg-purple-50 text-purple-900 border-purple-300 dark:bg-purple-900/80 dark:text-purple-200 dark:border-purple-500 font-bold tracking-wider'
  };
};

const CATEGORY_THEMES = {
  walkin_student: {
    label: 'STUDENT WALK-IN',
    shortLabel: 'STUDENT',
    icon: GraduationCap,
    bgClass: 'bg-white hover:bg-slate-50 border-slate-200 dark:bg-slate-900 dark:hover:bg-slate-850 dark:border-slate-800 shadow-sm hover:shadow-md',
    borderAccent: 'bg-cyan-500 dark:bg-cyan-400',
    badgeClass: 'bg-cyan-50 text-cyan-900 border-cyan-300 dark:bg-cyan-950 dark:text-cyan-300 dark:border-cyan-500 font-bold',
    iconBoxClass: 'bg-cyan-50 text-cyan-800 border-cyan-200 dark:bg-cyan-950 dark:text-cyan-300 dark:border-cyan-600',
    priceTextClass: 'text-cyan-700 dark:text-cyan-400 font-black',
  },
  walkin_regular: {
    label: 'REGULAR WALK-IN',
    shortLabel: 'REGULAR',
    icon: User,
    bgClass: 'bg-white hover:bg-slate-50 border-slate-200 dark:bg-slate-900 dark:hover:bg-slate-850 dark:border-slate-800 shadow-sm hover:shadow-md',
    borderAccent: 'bg-purple-500 dark:bg-purple-400',
    badgeClass: 'bg-purple-50 text-purple-900 border-purple-300 dark:bg-purple-950 dark:text-purple-300 dark:border-purple-500 font-bold',
    iconBoxClass: 'bg-purple-50 text-purple-800 border-purple-200 dark:bg-purple-950 dark:text-purple-300 dark:border-purple-600',
    priceTextClass: 'text-purple-700 dark:text-purple-400 font-black',
  },
  member: {
    label: 'EXISTING MEMBER',
    shortLabel: 'MEMBER',
    icon: ShieldCheck,
    bgClass: 'bg-white hover:bg-slate-50 border-slate-200 dark:bg-slate-900 dark:hover:bg-slate-850 dark:border-slate-800 shadow-sm hover:shadow-md',
    borderAccent: 'bg-blue-500 dark:bg-blue-400',
    badgeClass: 'bg-blue-50 text-blue-900 border-blue-300 dark:bg-blue-950 dark:text-blue-300 dark:border-blue-500 font-bold',
    iconBoxClass: 'bg-blue-50 text-blue-800 border-blue-200 dark:bg-blue-950 dark:text-blue-300 dark:border-blue-600',
    priceTextClass: 'text-blue-700 dark:text-blue-400 font-black',
  },
  new_subscription: {
    label: 'NEW MEMBERSHIP',
    shortLabel: 'SUBSCRIPTION',
    icon: Crown,
    bgClass: 'bg-white hover:bg-slate-50 border-slate-200 dark:bg-slate-900 dark:hover:bg-slate-850 dark:border-slate-800 shadow-sm hover:shadow-md',
    borderAccent: 'bg-emerald-500 dark:bg-emerald-400',
    badgeClass: 'bg-emerald-50 text-emerald-900 border-emerald-300 dark:bg-emerald-950 dark:text-emerald-300 dark:border-emerald-500 font-bold',
    iconBoxClass: 'bg-emerald-50 text-emerald-800 border-emerald-200 dark:bg-emerald-950 dark:text-emerald-300 dark:border-emerald-600',
    priceTextClass: 'text-emerald-700 dark:text-emerald-400 font-black',
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

  const receiptOpacity = useTransform(x, [15, 60], [0, 1]);
  const removeOpacity = useTransform(x, [-60, -15], [1, 0]);

  // --- ATTENDANCE MODE ---
  const attendanceMeta = useMemo(() => {
    if (mode !== 'attendance') return null;
    const log = data as LogRecord;
    const entryCategory = getEntryCategory(log);
    const theme = CATEGORY_THEMES[entryCategory];
    const paymentMethodInfo = getPaymentMethodInfo(log.paymentMethod);
    const isPaid = log.paymentStatus === 'Paid' || log.paymentStatus === 'Promo';
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

  // --- SALE MODE ---
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
          bgClass: 'bg-white hover:bg-slate-50 border-slate-200 dark:bg-slate-900 dark:hover:bg-slate-850 dark:border-slate-800 shadow-sm hover:shadow-md',
          borderAccent: 'bg-blue-500 dark:bg-blue-400',
          badgeClass: 'bg-blue-600 text-white border border-blue-400 font-bold',
          iconBoxClass: 'bg-blue-50 text-blue-800 border-blue-200 dark:bg-blue-950 dark:text-blue-300 dark:border-blue-600',
          priceTextClass: 'text-blue-700 dark:text-blue-400 font-black',
        }
      : isCash
      ? {
          type: 'cash',
          bgClass: 'bg-white hover:bg-slate-50 border-slate-200 dark:bg-slate-900 dark:hover:bg-slate-850 dark:border-slate-800 shadow-sm hover:shadow-md',
          borderAccent: 'bg-emerald-500 dark:bg-emerald-400',
          badgeClass: 'bg-emerald-700 text-white border border-emerald-500 dark:bg-emerald-800 dark:text-emerald-100 dark:border-emerald-400 font-bold',
          iconBoxClass: 'bg-emerald-50 text-emerald-800 border-emerald-200 dark:bg-emerald-950 dark:text-emerald-300 dark:border-emerald-600',
          priceTextClass: 'text-emerald-700 dark:text-emerald-400 font-black',
        }
      : {
          type: 'other',
          bgClass: 'bg-white hover:bg-slate-50 border-slate-200 dark:bg-slate-900 dark:hover:bg-slate-850 dark:border-slate-800 shadow-sm hover:shadow-md',
          borderAccent: 'bg-slate-400',
          badgeClass: 'bg-slate-700 text-white border border-slate-400 font-bold',
          iconBoxClass: 'bg-slate-100 text-slate-800 border-slate-300 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-600',
          priceTextClass: 'text-slate-800 dark:text-slate-300 font-black',
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
      return `pointer-events-auto flex items-stretch relative overflow-hidden select-none z-10 touch-pan-y min-h-[72px] sm:min-h-[76px] w-full group rounded-2xl border transition-all duration-200 ${attendanceMeta.theme.bgClass} p-2.5 sm:p-3.5`;
    }
    if (mode === 'sale' && saleMeta) {
      return `pointer-events-auto flex items-stretch relative overflow-hidden select-none z-10 touch-pan-y min-h-[72px] sm:min-h-[76px] w-full group rounded-2xl border transition-all duration-200 ${saleMeta.theme.bgClass} p-2.5 sm:p-3.5`;
    }
    return 'pointer-events-auto bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-3 sm:p-4 shadow-sm flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3 relative overflow-hidden select-none z-10 touch-pan-y w-full';
  }, [mode, attendanceMeta, saleMeta]);

  const CategoryIcon = attendanceMeta?.theme.icon || User;
  const PaymentIcon = attendanceMeta?.paymentMethodInfo.icon || Banknote;

  return (
    <div className="relative overflow-hidden rounded-2xl w-full">
      {/* Swipe background tracks */}
      <div className="absolute inset-0 rounded-2xl pointer-events-none select-none z-0 overflow-hidden bg-slate-200 dark:bg-slate-950">
        <motion.div 
          style={{ opacity: receiptOpacity }}
          className="absolute inset-y-0 left-0 bg-blue-600 flex items-center pl-6 text-white text-xs font-heading tracking-wider font-bold w-1/2"
        >
          RECEIPT
        </motion.div>
        
        <motion.div 
          style={{ opacity: removeOpacity }}
          className="absolute inset-y-0 right-0 bg-rose-600 flex items-center justify-end pr-6 text-white text-xs font-heading tracking-wider font-bold w-1/2"
        >
          REMOVE
        </motion.div>
      </div>

      {/* Main card */}
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
        {/* ATTENDANCE CARD */}
        {mode === 'attendance' && attendanceMeta && (
          <>
            <div className={`absolute left-0 top-0 bottom-0 w-1.5 ${attendanceMeta.theme.borderAccent}`} />

            <div className="flex items-center gap-2.5 sm:gap-4 w-full min-w-0 flex-1 pl-1.5">
              {/* Left Column: Time & Icon */}
              <div className="flex flex-col items-center justify-center shrink-0 select-none">
                <span className="text-[9px] sm:text-[10px] font-mono font-bold text-slate-600 dark:text-slate-300 mb-1 leading-none tracking-tight">
                  {attendanceMeta.formattedInTime}
                </span>
                <div className={`w-10 h-10 sm:w-11 sm:h-11 rounded-xl flex items-center justify-center relative border transition-transform duration-200 group-hover:scale-105 ${attendanceMeta.theme.iconBoxClass}`}>
                  <CategoryIcon className="w-5 h-5 sm:w-5.5 sm:h-5.5 stroke-[2]" />
                  
                  <div className={`absolute -bottom-1 -right-1 w-4 h-4 rounded-full flex items-center justify-center text-white border border-white dark:border-slate-900 shadow-sm ${
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

              {/* Center Info */}
              <div className="min-w-0 flex-1 text-left space-y-1 py-0.5">
                <div className="flex items-center gap-1.5 sm:gap-2 min-w-0 flex-wrap">
                  {attendanceMeta.log.memberId ? (
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
                </div>

                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className={`px-2 py-0.5 rounded text-[8.5px] sm:text-[9.5px] font-heading font-bold tracking-wider uppercase leading-none border inline-flex items-center gap-1 shrink-0 ${attendanceMeta.theme.badgeClass}`}>
                    <CategoryIcon className="w-2.5 h-2.5 sm:w-3 sm:h-3 stroke-[2]" />
                    <span>{attendanceMeta.theme.label}</span>
                  </span>

                  <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[8.5px] sm:text-[9.5px] font-heading font-bold uppercase leading-none border shrink-0 ${attendanceMeta.paymentMethodInfo.badgeClass}`}>
                    <PaymentIcon className="w-2.5 h-2.5 sm:w-3 sm:h-3 stroke-[2]" />
                    <span>{attendanceMeta.paymentMethodInfo.label}</span>
                  </span>
                </div>
              </div>

              {/* Price & Actions */}
              <div className="flex items-center gap-2 sm:gap-3 shrink-0 select-none pr-1">
                <div className="text-right">
                  <span className="text-[8px] font-heading font-bold tracking-widest text-slate-500 dark:text-slate-400 block leading-none uppercase">ENTRY FEE</span>
                  <div className="flex items-center justify-end gap-1 mt-0.5 leading-none">
                    <span className={`text-xs sm:text-sm font-mono font-black tracking-tight ${attendanceMeta.theme.priceTextClass}`}>
                      ₱{attendanceMeta.log.amountPaid.toFixed(2)}
                    </span>
                  </div>
                  <span className="text-[8.5px] font-sans font-bold text-slate-500 dark:text-slate-400 hidden sm:block mt-0.5 max-w-[100px] truncate text-right">
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
                    className={`px-2.5 sm:px-3 py-1.5 rounded-lg text-[9px] sm:text-[10px] font-heading tracking-widest uppercase transition-all shrink-0 cursor-pointer font-bold border shadow-xs ${
                      attendanceMeta.isPaid
                        ? 'bg-emerald-500/15 text-emerald-800 border-emerald-400 dark:bg-emerald-950/80 dark:text-emerald-300 dark:border-emerald-500 hover:bg-rose-500/15 hover:text-rose-700 hover:border-rose-400'
                        : 'bg-amber-400 text-slate-950 border-amber-300 hover:bg-emerald-500 hover:text-white dark:bg-amber-500 animate-pulse'
                    }`}
                  >
                    {attendanceMeta.isPaid ? 'PAID' : 'COLLECT'}
                  </button>
                ) : (
                  <div className={`px-2.5 sm:px-3 py-1.5 rounded-lg text-[9px] sm:text-[10px] font-heading tracking-widest uppercase shrink-0 font-bold border select-none shadow-xs ${
                    attendanceMeta.isPaid
                      ? 'bg-emerald-500/15 text-emerald-800 border-emerald-400 dark:bg-emerald-950 dark:text-emerald-300 dark:border-emerald-500'
                      : 'bg-rose-500/15 text-rose-700 border-rose-400 dark:bg-rose-950 dark:text-rose-300 dark:border-rose-500'
                  }`}>
                    {attendanceMeta.isPaid ? 'PAID' : 'UNPAID'}
                  </div>
                )}

                <div className="hidden sm:flex items-center gap-1 pl-1">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onSelectReceipt(attendanceMeta.log);
                    }}
                    className="p-1.5 text-slate-600 hover:text-blue-600 hover:bg-blue-50 border-slate-300 hover:border-blue-400 dark:text-slate-300 dark:hover:text-blue-400 dark:hover:bg-blue-950/80 dark:border-slate-700 rounded-lg transition-all border cursor-pointer shrink-0"
                    title="View Receipt"
                  >
                    <Printer className="w-4 h-4 stroke-[2]" />
                  </button>

                  {canDelete && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onTriggerDelete(attendanceMeta.log);
                      }}
                      className="p-1.5 text-slate-600 hover:text-rose-600 hover:bg-rose-50 border-slate-300 hover:border-rose-400 dark:text-slate-300 dark:hover:text-rose-400 dark:hover:bg-rose-950/80 dark:border-slate-700 rounded-lg transition-all border cursor-pointer shrink-0"
                      title="Remove this check-in"
                    >
                      <Trash2 className="w-4 h-4 stroke-[2]" />
                    </button>
                  )}
                </div>
              </div>
            </div>
          </>
        )}

        {/* SALE CARD */}
        {mode === 'sale' && saleMeta && (
          <>
            <div className={`absolute left-0 top-0 bottom-0 w-1.5 ${saleMeta.theme.borderAccent}`} />

            <div className="flex items-center gap-3 sm:gap-4 w-full min-w-0 flex-1 pl-1.5">
              <div className="flex flex-col items-center justify-center shrink-0 select-none">
                <span className="text-[9px] sm:text-[10px] font-mono font-bold text-slate-600 dark:text-slate-300 mb-1 leading-none tracking-tight">
                  {saleMeta.formattedTime}
                </span>
                <div className={`w-10 h-10 sm:w-11 sm:h-11 rounded-xl border flex flex-col items-center justify-center ${saleMeta.theme.iconBoxClass}`}>
                  <span className="text-xs sm:text-sm font-heading font-bold leading-none">{saleMeta.totalUnits}</span>
                  <span className="text-[7.5px] font-heading font-bold uppercase tracking-widest leading-none mt-0.5">PCS</span>
                </div>
              </div>

              <div className="min-w-0 flex-1 text-left space-y-1">
                <div className="flex items-center gap-2 flex-wrap min-w-0">
                  <h4 className="text-xs sm:text-sm font-heading font-bold tracking-wide text-slate-900 dark:text-white uppercase truncate max-w-[200px] sm:max-w-md leading-tight">
                    {saleMeta.summaryHeader}
                  </h4>

                  <span className={`px-2 py-0.5 rounded text-[10px] font-heading font-bold tracking-wider uppercase leading-none border inline-flex items-center gap-1 shrink-0 ${saleMeta.theme.badgeClass}`}>
                    {saleMeta.isGCash ? <Wallet className="w-3 h-3 stroke-[2]" /> : <Banknote className="w-3 h-3 stroke-[2]" />}
                    <span>{saleMeta.tx.payment_method || 'Cash'}</span>
                  </span>
                </div>

                <div className="flex flex-wrap gap-1">
                  {saleMeta.tx.items && Array.isArray(saleMeta.tx.items) ? (
                    saleMeta.tx.items.map((item: any, idx: number) => (
                      <span 
                        key={idx} 
                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-slate-100 text-slate-800 border-slate-300 dark:bg-slate-800 dark:text-slate-200 dark:border-slate-700 text-[10px] font-sans font-bold border shrink-0"
                      >
                        <span className={`font-heading font-bold text-[10px] ${saleMeta.theme.priceTextClass}`}>
                          {item.quantity}x
                        </span>
                        <span className="truncate">{item.productName || item.product_name}</span>
                      </span>
                    ))
                  ) : (
                    <div className="text-xs text-slate-700 dark:text-slate-300 truncate font-sans font-semibold">
                      {saleMeta.tx.product_name || saleMeta.tx.productName}
                    </div>
                  )}
                </div>

                {(saleMeta.changeCalculated > 0 || saleMeta.gcashFeeApplied > 0) && (
                  <div className="text-[10px] text-slate-600 dark:text-slate-300 font-mono flex items-center gap-2 flex-wrap pt-0.5">
                    {saleMeta.changeCalculated > 0 && (
                      <span className="font-bold text-emerald-600 dark:text-emerald-400">CHANGE: ₱{saleMeta.changeCalculated.toFixed(2)}</span>
                    )}
                    {saleMeta.gcashFeeApplied > 0 && (
                      <span className="text-sky-600 dark:text-sky-400 font-bold">+₱{saleMeta.gcashFeeApplied.toFixed(2)} FEE</span>
                    )}
                  </div>
                )}
              </div>

              <div className="flex items-center gap-2 shrink-0 select-none pr-1">
                <div className="text-right">
                  <span className="text-[8px] font-heading font-bold tracking-widest text-slate-500 dark:text-slate-400 block leading-none uppercase">TOTAL SALE</span>
                  <div className="flex items-center justify-end gap-1 mt-0.5 leading-none">
                    <span className={`text-xs sm:text-sm font-mono font-black tracking-tight ${saleMeta.theme.priceTextClass}`}>
                      ₱{saleMeta.totalAmount.toFixed(2)}
                    </span>
                  </div>
                </div>

                <div className="hidden sm:flex items-center gap-1 pl-1">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onSelectReceipt(saleMeta.tx);
                    }}
                    className="p-1.5 text-slate-600 hover:text-blue-600 hover:bg-blue-50 border-slate-300 hover:border-blue-400 dark:text-slate-300 dark:hover:text-blue-400 dark:hover:bg-blue-950/80 dark:border-slate-700 rounded-lg transition-all border cursor-pointer shrink-0"
                    title="View Receipt"
                  >
                    <Printer className="w-4 h-4 stroke-[2]" />
                  </button>

                  {canDelete && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onTriggerDelete(saleMeta.tx);
                      }}
                      className="p-1.5 text-slate-600 hover:text-rose-600 hover:bg-rose-50 border-slate-300 hover:border-rose-400 dark:text-slate-300 dark:hover:text-rose-400 dark:hover:bg-rose-950/80 dark:border-slate-700 rounded-lg transition-all border cursor-pointer shrink-0"
                      title="Remove this sale"
                    >
                      <Trash2 className="w-4 h-4 stroke-[2]" />
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