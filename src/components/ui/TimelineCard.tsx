// src/components/ui/TimelineCard.tsx
import React, { useMemo } from 'react';
import { format, parseISO } from 'date-fns';
import { motion, useMotionValue, useTransform } from 'framer-motion';
import { Check, Clock, Printer, Trash2 } from 'lucide-react';

export interface LogRecord {
  id: string;
  timestamp: string;
  checkOutTime?: string;
  memberId: string | null;
  customerName: string;
  customerType: 'Walk-In' | 'Existing Member' | 'New Membership';
  categoryOrPlan: string;
  paymentMethod: 'Cash' | 'GCash' | 'Free';
  amountPaid: number;
  paymentStatus: 'Paid' | 'Free' | 'Unpaid';
  status: 'Active' | 'Expires Soon' | 'Expired' | 'Suspended';
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

  // Derive a clamped motion value so the card physically stops sliding at ±120px
  const clampedX = useTransform(x, (value) => Math.min(Math.max(value, -120), 120));

  // Map reveal track opacities to clampedX with explicit boundaries
  const receiptOpacity = useTransform(clampedX, [0, 80], [0, 1], { clamp: true });
  const removeOpacity = useTransform(clampedX, [-80, 0], [1, 0], { clamp: true });

  const containerClasses = useMemo(() => {
    return mode === 'attendance'
      ? 'pointer-events-auto bg-(--bg-card) flex items-stretch cursor-pointer relative overflow-hidden select-none z-10 touch-none h-18 sm:h-20 w-full'
      : 'pointer-events-auto bg-(--bg-card) p-4 sm:p-5 shadow-sm hover:shadow-md transition-shadow flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4 cursor-pointer relative overflow-hidden select-none z-10 touch-none w-full';
  }, [mode]);

  // --- ATTENDANCE MODE DERIVED VARIABLES ---
  const attendanceMeta = useMemo(() => {
    if (mode !== 'attendance') return null;
    const log = data as LogRecord;
    const isPaid = log.paymentStatus === 'Paid' || log.paymentStatus === 'Free';
    const formattedInTime = log.timestamp ? format(parseISO(log.timestamp), 'hh:mm a') : 'N/A';
    const planLabel = log.categoryOrPlan.replace('Pass', '').replace('Membership', '').trim();
    return { log, isPaid, formattedInTime, planLabel };
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
    const isGCash = tx.payment_method === 'GCash';
    const refNumber = tx.reference_number;
    const receivedAmount = Number(tx.amount_received || 0);
    const totalAmount = Number(tx.total_amount || tx.totalAmount || 0);
    const changeCalculated = Number(tx.change_calculated || 0);
    const gcashFeeApplied = Number(tx.gcash_fee_applied || 0);
    return { tx, totalUnits, formattedTime, summaryHeader, isGCash, refNumber, receivedAmount, totalAmount, changeCalculated, gcashFeeApplied };
  }, [mode, data]);

  return (
    <div className="relative overflow-hidden rounded-2xl bg-slate-100 dark:bg-zinc-900 border border-(--border-color) w-full">
      {/* Swipe reveal background tracks */}
      <div className="absolute inset-px rounded-[15px] pointer-events-none select-none z-0 overflow-hidden">
        <motion.div 
          style={{ opacity: receiptOpacity }}
          className="absolute inset-y-0 left-0 bg-blue-600 dark:bg-blue-750 flex items-center pl-6 text-white text-[10px] font-heading tracking-wider font-extrabold w-1/2"
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

      {/* Sliding card cover element */}
      <motion.div
        style={{ x: clampedX }}
        drag="x"
        dragDirectionLock={true}
        dragConstraints={{ left: 0, right: 0 }}
        dragElastic={{ left: 0.35, right: 0.35 }}
        onDragEnd={(e, info) => onDragEnd(e, info, data)}
        whileTap={{ scale: 0.99 }}
        layout="position"
        className={containerClasses}
      >
        {/* =========================================
            LAYOUT A: ATTENDANCE RENDERING MODULE
            ========================================= */}
        {mode === 'attendance' && attendanceMeta && (
          <>
            {/* Left status / indicator block */}
            <div className={`w-18 sm:w-20 bg-slate-50 dark:bg-zinc-800/80 flex items-center justify-center relative shrink-0 border-r border-(--border-color) ${
              attendanceMeta.isPaid ? 'text-emerald-500' : 'text-[#bf0202]'
            }`}>
              {attendanceMeta.isPaid ? (
                <div className="w-8 h-8 rounded-full bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center">
                  <Check className="w-4.5 h-4.5" />
                </div>
              ) : (
                <div className="w-8 h-8 rounded-full bg-rose-500/10 border border-rose-500/20 flex items-center justify-center">
                  <Clock className="w-4.5 h-4.5" />
                </div>
              )}
              <div className={`absolute bottom-0 inset-x-0 h-1 ${attendanceMeta.isPaid ? 'bg-emerald-500' : 'bg-[#bf0202]'}`} />
            </div>

            {/* Core details block */}
            <div className="flex-1 min-w-0 p-3 flex items-center justify-between gap-4">
              <div className="min-w-0 text-left space-y-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <h4 className="text-xs sm:text-sm font-heading font-black tracking-wide text-(--color-text) uppercase truncate max-w-40 leading-none">
                    {attendanceMeta.log.customerName}
                  </h4>
                  <span className={`px-2 py-0.5 rounded text-[8px] font-heading font-black tracking-wider uppercase leading-none ${
                    attendanceMeta.log.customerType === 'Walk-In' 
                      ? 'bg-purple-500/10 text-purple-500' 
                      : attendanceMeta.log.customerType === 'Existing Member' 
                        ? 'bg-blue-500/10 text-blue-500' 
                        : 'bg-emerald-500/10 text-emerald-500'
                  }`}>
                    {attendanceMeta.log.customerType === 'Existing Member' ? 'MEMBER' : attendanceMeta.log.customerType}
                  </span>
                </div>
                <p className="text-[10px] text-slate-400 font-mono font-bold leading-none">
                  IN: {attendanceMeta.formattedInTime}
                </p>
              </div>

              {/* Pricing highlight & action badge */}
              <div className="flex items-center gap-3 shrink-0 select-none pr-1">
                <div className="text-right">
                  <span className="text-[8px] font-heading tracking-widest text-slate-400 block leading-none uppercase">ENTRY FEE</span>
                  <div className="flex items-center gap-1.5 mt-1 leading-none">
                    <span className="text-xs sm:text-sm font-heading font-extrabold text-emerald-500 tracking-wider">
                      ₱{attendanceMeta.log.amountPaid.toFixed(2)}
                    </span>
                    <span className="text-[8px] font-sans font-bold text-slate-455">
                      ({attendanceMeta.planLabel})
                    </span>
                  </div>
                </div>

                {canDelete ? (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      if (attendanceMeta.isPaid) {
                        onTriggerUndoPayment?.(attendanceMeta.log);
                      } else {
                        onTriggerCollectPayment?.(attendanceMeta.log);
                      }
                    }}
                    className={`px-3 py-1.5 rounded-lg text-[8px] font-heading tracking-widest uppercase transition-all shrink-0 cursor-pointer font-bold border ${
                      attendanceMeta.isPaid
                        ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/10 hover:bg-rose-500/10 hover:text-rose-500 hover:border-rose-500/10'
                        : 'bg-amber-500/10 text-amber-500 border-amber-500/10 hover:bg-emerald-500/10 hover:text-emerald-500 hover:border-emerald-500/10'
                    }`}
                  >
                    {attendanceMeta.isPaid ? 'PAID' : 'COLLECT'}
                  </button>
                ) : (
                  <div className={`px-3 py-1.5 rounded-lg text-[8px] font-heading tracking-widest uppercase shrink-0 font-bold border select-none ${
                    attendanceMeta.isPaid
                      ? 'bg-emerald-500/5 text-emerald-500/60 border-emerald-500/10 dark:bg-emerald-500/5 dark:text-emerald-500/50'
                      : 'bg-rose-500/5 text-rose-500/60 border-rose-500/10 dark:bg-rose-500/5 dark:text-rose-500/50'
                  }`}>
                    {attendanceMeta.isPaid ? 'PAID' : 'UNPAID'}
                  </div>
                )}
              </div>
            </div>
          </>
        )}

        {/* =========================================
            LAYOUT B: SALE RENDERING MODULE
            ========================================= */}
        {mode === 'sale' && saleMeta && (
          <>
            {/* Absolute indicator for reference/received value */}
            <div className="absolute top-3 right-4 text-[9px] font-mono font-bold text-slate-400 dark:text-slate-500 whitespace-nowrap">
              {saleMeta.isGCash ? (
                saleMeta.refNumber ? `REF: ${saleMeta.refNumber}` : 'GCASH PAYMENT'
              ) : (
                `RECEIVED: ₱${saleMeta.receivedAmount.toFixed(2)}`
              )}
            </div>

            <div className="flex items-center gap-4 w-full md:w-auto min-w-0 flex-1">
              {/* Left indicator column: PCS counts */}
              <div className="flex flex-col items-center gap-1.5 shrink-0 select-none">
                <div className="w-12 h-12 rounded-2xl bg-slate-100 dark:bg-zinc-800 text-(--color-primary) dark:text-(--color-primary-light) border border-(--border-color) flex flex-col items-center justify-center">
                  <span className="text-[14px] font-heading font-extrabold leading-none">{saleMeta.totalUnits}</span>
                  <span className="text-[8px] font-heading font-bold text-slate-400 uppercase tracking-widest leading-none mt-1">PCS</span>
                </div>
                <div className="text-xs font-heading font-extrabold text-(--color-text) mt-0.5 whitespace-nowrap">
                  ₱{saleMeta.totalAmount.toFixed(2)}
                </div>
              </div>

              {/* Core metadata blocks */}
              <div className="min-w-0 flex-1 text-left space-y-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <h4 className="text-sm font-bold text-(--color-text) truncate">{saleMeta.summaryHeader}</h4>
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-100 dark:bg-zinc-800 text-slate-500 font-sans tracking-wider border border-(--border-color) shrink-0">
                    {saleMeta.tx.receipt_no}
                  </span>
                </div>

                {/* Sub-items block listing */}
                <div className="flex flex-wrap gap-1.5">
                  {saleMeta.tx.items && Array.isArray(saleMeta.tx.items) ? (
                    saleMeta.tx.items.map((item: any, idx: number) => (
                      <span 
                        key={idx} 
                        className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-lg bg-slate-100 dark:bg-zinc-800/80 text-[10px] font-sans text-slate-600 dark:text-slate-400 border border-(--border-color) max-w-45 shrink-0"
                      >
                        <span className="font-heading font-extrabold text-[9px] text-(--color-primary-light)">
                          {item.quantity}x
                        </span>
                        <span className="truncate">{item.productName || item.product_name}</span>
                      </span>
                    ))
                  ) : (
                    <div className="text-xs text-slate-500 dark:text-slate-400 truncate">
                      {saleMeta.tx.product_name || saleMeta.tx.productName}
                    </div>
                  )}
                </div>

                {/* Extended timestamps / status lines */}
                <div className="text-[11px] text-slate-500 dark:text-slate-400 font-mono flex items-center gap-1.5 flex-wrap pt-0.5">
                  <span>Payment: {saleMeta.tx.payment_method}</span>
                  <span className="text-slate-300 dark:text-zinc-700">•</span>
                  <span>Time: {saleMeta.formattedTime}</span>
                  {saleMeta.changeCalculated > 0 && (
                    <>
                      <span className="text-slate-300 dark:text-zinc-700">•</span>
                      <span className="text-slate-455">Change: ₱{saleMeta.changeCalculated.toFixed(2)}</span>
                    </>
                  )}
                  {saleMeta.gcashFeeApplied > 0 && (
                    <>
                      <span className="text-slate-300 dark:text-zinc-700">•</span>
                      <span className="text-emerald-600 dark:text-emerald-400 font-bold">+₱{saleMeta.gcashFeeApplied.toFixed(2)} Fee</span>
                    </>
                  )}
                </div>
              </div>
            </div>

            {/* Desktop Action Column */}
            <div className="hidden md:flex items-center gap-2 shrink-0 select-none">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onSelectReceipt(saleMeta.tx);
                }}
                className="p-3 text-blue-500 dark:text-blue-400 hover:bg-blue-500/10 rounded-xl transition-all border border-transparent hover:border-blue-500/20 cursor-pointer shrink-0"
                title="View Receipt"
              >
                <Printer className="w-4.5 h-4.5" />
              </button>

              {canDelete && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onTriggerDelete(saleMeta.tx);
                  }}
                  className="p-3 text-red-500 dark:text-rose-400 hover:bg-red-500/10 rounded-xl transition-all border border-transparent hover:border-red-500/20 cursor-pointer shrink-0"
                  title="Remove this sale"
                >
                  <Trash2 className="w-4.5 h-4.5" />
                </button>
              )}
            </div>
          </>
        )}
      </motion.div>
    </div>
  );
};

export const TimelineCard = React.memo(TimelineCardComponent);