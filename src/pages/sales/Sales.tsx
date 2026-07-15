// src/pages/sales/Sales.tsx
import React, { useState, useEffect, useMemo, useContext, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { 
  format, 
  startOfWeek, 
  endOfWeek, 
  addDays, 
  isToday, 
  startOfDay, 
  addWeeks, 
  subWeeks,
  getDay,
  parseISO 
} from 'date-fns';
import { 
  Search, 
  Plus, 
  Trash2, 
  ChevronLeft, 
  ChevronRight, 
  RotateCcw, 
  ShoppingBag, 
  FileSpreadsheet,
  Printer 
} from 'lucide-react';
import { motion, AnimatePresence, useMotionValue, useTransform } from 'framer-motion';
import { toast } from 'react-toastify';

import 'react-loading-skeleton/dist/skeleton.css';

// Supabase & Authentication Stores
import { supabase } from '../../lib/supabase/client'; 
import { useAuthStore } from '../../stores/authStore';
import { isSuperAdmin } from '../../constants/auth';

// UI Helpers
import { Button } from '../../components/ui/Button';
import { UndoToast } from '../../components/ui/UndoToast'; 
import { TabLoader } from '../../components/ui/TabLoader'; 
import { Modal } from '../../components/ui/Modal';
import { HeaderActionsContext } from '../../routes';
import { SalesDialog } from './components/SalesDialog';
import { Products } from './Products'; 
import { useResponsiveItemsPerPage } from '../../lib/useResponsiveItemsPerPage';
import { SalesRecycleBin } from './components/SalesRecycleBin';

// Separated Modular Components
import { SalesOfficialReceipt } from './components/SalesOfficialReceipt';
import { SalesReportCompiler } from './components/SalesReportCompiler';

const DAYS_OF_WEEK: string[] = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];

const isTransactionDeletable = (tx: any) => {
  const todayStr = format(new Date(), 'yyyy-MM-dd');
  const txDate = tx.created_at ? format(new Date(tx.created_at), 'yyyy-MM-dd') : format(new Date(), 'yyyy-MM-dd');
  return txDate === todayStr;
};

// =============================================================================
// SUB-COMPONENT: TRANSACTION SKELETON (Renders custom loading placeholders)
// =============================================================================
const TransactionSkeleton: React.FC = () => {
  return (
    <div className="relative overflow-hidden rounded-2xl bg-(--bg-card) border border-(--border-color) p-4 sm:p-5 flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4 animate-pulse select-none">
      <div className="flex items-center gap-4 w-full md:w-auto min-w-0 flex-1">
        {/* Left indicator mock */}
        <div className="flex flex-col items-center gap-1.5 shrink-0">
          <div className="w-12 h-12 rounded-2xl bg-slate-100 dark:bg-zinc-800 border border-(--border-color)" />
          <div className="h-4 w-12 bg-slate-200/60 dark:bg-zinc-800/60 rounded mt-0.5" />
        </div>

        {/* Content details block mock */}
        <div className="min-w-0 flex-1 text-left space-y-1.5">
          <div className="flex items-center gap-2 flex-wrap">
            <div className="h-4.5 w-40 sm:w-56 bg-slate-200/60 dark:bg-zinc-800/60 rounded" />
            <div className="h-4.5 w-16 bg-slate-100 dark:bg-zinc-800/80 rounded-full border border-(--border-color)" />
          </div>

          {/* Sub-item badges mock */}
          <div className="flex flex-wrap gap-1.5 pt-0.5">
            <div className="h-5 w-24 bg-slate-100/50 dark:bg-zinc-800/30 rounded-lg border border-(--border-color)" />
            <div className="h-5 w-32 bg-slate-100/50 dark:bg-zinc-800/30 rounded-lg border border-(--border-color)" />
          </div>

          {/* Metadata placeholders */}
          <div className="flex items-center gap-1.5 flex-wrap pt-0.5">
            <div className="h-3 w-28 bg-slate-200/30 dark:bg-zinc-800/20 rounded" />
            <span className="text-slate-200 dark:text-zinc-800">•</span>
            <div className="h-3 w-16 bg-slate-200/30 dark:bg-zinc-800/20 rounded" />
          </div>
        </div>
      </div>

      {/* Desktop action buttons mock */}
      <div className="hidden md:flex items-center gap-2 shrink-0">
        <div className="w-10.5 h-10.5 rounded-xl bg-slate-100 dark:bg-zinc-800 border border-(--border-color)" />
        <div className="w-10.5 h-10.5 rounded-xl bg-slate-100 dark:bg-zinc-800 border border-(--border-color)" />
      </div>
    </div>
  );
};

// =============================================================================
// SUB-COMPONENT: TRANSACTION CARD (Isolates swipe physics cleanly) [3.1]
// =============================================================================
interface TransactionCardProps {
  tx: any;
  canDeleteTx: boolean;
  onSelectReceipt: (tx: any) => void;
  onTriggerDelete: (tx: any) => void;
  onDragEnd: (_event: any, info: any, tx: any) => void;
}

const TransactionCard: React.FC<TransactionCardProps> = ({
  tx,
  canDeleteTx,
  onSelectReceipt,
  onTriggerDelete,
  onDragEnd
}) => {
  const x = useMotionValue(0);

  // Derive a clamped motion value so the card physically stops sliding at ±120px [3.1]
  const clampedX = useTransform(x, (value) => Math.min(Math.max(value, -120), 120));

  // Map reveal track opacities to clampedX with explicit boundaries to prevent extrapolation [3.1]
  const receiptOpacity = useTransform(clampedX, [0, 80], [0, 1], { clamp: true });
  const removeOpacity = useTransform(clampedX, [-80, 0], [1, 0], { clamp: true });

  const totalUnits = tx.quantity || tx.items?.reduce((sum: number, i: any) => sum + i.quantity, 0) || 1;
  const formattedTime = tx.created_at ? format(parseISO(tx.created_at), 'hh:mm a') : 'N/A';

  const summaryHeader = useMemo(() => {
    if (tx.items && Array.isArray(tx.items) && tx.items.length > 0) {
      const firstItem = tx.items[0];
      const firstItemName = firstItem.productName || firstItem.product_name;
      if (tx.items.length > 1) {
        return `${firstItemName} & ${tx.items.length - 1} other item${tx.items.length - 1 > 1 ? 's' : ''}`;
      }
      return firstItemName;
    }
    return tx.product_name || tx.productName || 'Sales Transaction';
  }, [tx]);

  // Determine if payment is GCash and extract reference metadata
  const isGCash = tx.payment_method === 'GCash' || tx.paymentMethod === 'GCash';
  const refNumber = tx.reference_number || tx.referenceNumber;
  const receivedAmount = Number(tx.amount_received || tx.amountReceived || 0);

  return (
    <div className="relative overflow-hidden rounded-2xl bg-slate-100 dark:bg-zinc-900 border border-(--border-color)">
      {/* --- SWIPE REVEAL BACKGROUND TRACK COLOR MODULES WITH SUBPIXEL PROTECTION [3.1] --- */}
      <div className="absolute inset-px rounded-[15px] pointer-events-none select-none z-0 overflow-hidden">
        {/* Left Reveal (Swipe Right -> Open Blue Receipt) [3.1] */}
        <motion.div 
          style={{ opacity: receiptOpacity }}
          className="absolute inset-y-0 left-0 bg-blue-600 dark:bg-blue-750 flex items-center pl-6 text-white text-[10px] font-heading tracking-wider font-extrabold w-1/2"
        >
          RECEIPT
        </motion.div>
        
        {/* Right Reveal (Swipe Left -> Delete Red Remove) [3.1] */}
        <motion.div 
          style={{ opacity: removeOpacity }}
          className="absolute inset-y-0 right-0 bg-rose-600 dark:bg-rose-700 flex items-center justify-end pr-6 text-white text-[10px] font-heading tracking-wider font-extrabold w-1/2"
        >
          REMOVE
        </motion.div>
      </div>

      {/* --- SLIDING CARD ELEMENT LAYER --- */}
      <motion.div
        style={{ x: clampedX }} // Bind to the clamped value to apply the drag boundaries
        drag="x"
        dragDirectionLock={true} // Locks drag axis to X only
        dragConstraints={{ left: 0, right: 0 }} // Snaps card back to origin on release
        dragElastic={{ left: 0.5, right: 0.5 }}
        onDragEnd={(e, info) => onDragEnd(e, info, tx)}
        whileTap={{ scale: 0.99 }}
        className="pointer-events-auto bg-(--bg-card) p-4 sm:p-5 shadow-sm hover:shadow-md transition-shadow flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4 cursor-pointer relative overflow-hidden select-none z-10 touch-none"
      >
        {/* ABSOLUTE TOP-RIGHT RECEIVED METRIC OR GCASH REFERENCE */}
        <div className="absolute top-3 right-4 text-[9px] font-mono font-bold text-slate-400 dark:text-slate-500 whitespace-nowrap">
          {isGCash ? (
            refNumber ? `REF: ${refNumber}` : 'GCASH PAYMENT'
          ) : (
            `RECEIVED: ₱${receivedAmount.toFixed(2)}`
          )}
        </div>

        <div className="flex items-center gap-4 w-full md:w-auto min-w-0 flex-1">
          {/* Left indicator column: PCS Box & Total Cost directly below */}
          <div className="flex flex-col items-center gap-1.5 shrink-0 select-none">
            {/* Pieces count indicator */}
            <div className="w-12 h-12 rounded-2xl bg-slate-100 dark:bg-zinc-800 text-(--color-primary) dark:text-(--color-primary-light) border border-(--border-color) flex flex-col items-center justify-center">
              <span className="text-[14px] font-heading font-extrabold leading-none">{totalUnits}</span>
              <span className="text-[8px] font-heading font-bold text-slate-400 uppercase tracking-widest leading-none mt-1">PCS</span>
            </div>
            {/* Price below indicator box */}
            <div className="text-xs font-heading font-extrabold text-(--color-text) mt-0.5 whitespace-nowrap">
              ₱{Number(tx.total_amount || tx.totalAmount).toFixed(2)}
            </div>
          </div>

          <div className="min-w-0 flex-1 text-left space-y-1">
            <div className="flex items-center gap-2 flex-wrap">
              <h4 className="text-sm font-bold text-(--color-text) truncate">{summaryHeader}</h4>
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-100 dark:bg-zinc-800 text-slate-500 font-sans tracking-wider border border-(--border-color) shrink-0">
                {tx.receipt_no}
              </span>
            </div>
            
            {/* Compact horizontal product badges */}
            <div className="flex flex-wrap gap-1.5">
              {tx.items && Array.isArray(tx.items) ? (
                tx.items.map((item: any, idx: number) => (
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
                  {tx.product_name || tx.productName}
                </div>
              )}
            </div>

            <div className="text-[11px] text-slate-500 dark:text-slate-400 font-mono flex items-center gap-1.5 flex-wrap pt-0.5">
              <span>Payment: {tx.payment_method}</span>
              <span className="text-slate-300 dark:text-zinc-700">•</span>
              <span>Time: {formattedTime}</span>
              {tx.change_calculated > 0 && (
                <>
                  <span className="text-slate-300 dark:text-zinc-700">•</span>
                  <span className="text-slate-455">Change: ₱{Number(tx.change_calculated).toFixed(2)}</span>
                </>
              )}
              {tx.gcash_fee_applied > 0 && (
                <>
                  <span className="text-slate-300 dark:text-zinc-700">•</span>
                  <span className="text-emerald-600 dark:text-emerald-400 font-bold">+₱{Number(tx.gcash_fee_applied).toFixed(2)} Fee</span>
                </>
              )}
            </div>
          </div>
        </div>

        {/* --- DESKTOP ACTION COLUMN --- */}
        <div className="hidden md:flex items-center gap-2 shrink-0 select-none">
          {/* View Receipt Button */}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onSelectReceipt(tx);
            }}
            className="p-3 text-blue-500 dark:text-blue-400 hover:bg-blue-500/10 rounded-xl transition-all border border-transparent hover:border-blue-500/20 cursor-pointer shrink-0"
            title="View Receipt"
          >
            <Printer className="w-4.5 h-4.5" />
          </button>

          {/* Remove Transaction Button */}
          {canDeleteTx && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onTriggerDelete(tx);
              }}
              className="p-3 text-red-500 dark:text-rose-400 hover:bg-red-500/10 rounded-xl transition-all border border-transparent hover:border-red-500/20 cursor-pointer shrink-0"
              title="Remove this sale"
            >
              <Trash2 className="w-4.5 h-4.5" />
            </button>
          )}
        </div>
      </motion.div>
    </div>
  );
};

export const Sales: React.FC = () => {
  const { setActions } = useContext(HeaderActionsContext);
  const navigate = useNavigate();
  const { subview } = useParams<{ subview: string }>();

  const activeView = useMemo<'register' | 'inventory'>(() => {
    return subview === 'products' ? 'inventory' : 'register';
  }, [subview]);

  const { user, profile } = useAuthStore() as any;
  const role = useMemo<'admin' | 'staff'>(() => {
    if (isSuperAdmin(user?.email)) return 'admin';
    return (profile?.role?.toLowerCase() === 'admin' ? 'admin' : 'staff');
  }, [user, profile]);

  const handlePcViewTransition = (view: 'register' | 'inventory') => {
    if (view === 'inventory') {
      navigate('/sales/products');
    } else {
      navigate('/sales');
    }
  };

  useEffect(() => {
    if (role === 'staff' && activeView === 'inventory') {
      navigate('/sales', { replace: true });
    }
  }, [role, activeView, navigate]);

  const [currentWeekStart, setCurrentWeekStart] = useState<Date>(() => 
    startOfWeek(new Date(), { weekStartsOn: 0 })
  );
  const [selectedDayIndex, setSelectedDayIndex] = useState<number>(() => getDay(new Date()));
  const [ledgerSearch, setLedgerSearch] = useState('');
  
  const [transactions, setTransactions] = useState<any[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  const [ratesConfig, setRatesConfig] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [loadingTransactions, setLoadingTransactions] = useState(false);

  const itemsPerPage = useResponsiveItemsPerPage();
  const [currentPage, setCurrentPage] = useState(1);

  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [selectedReceiptTx, setSelectedReceiptTx] = useState<any | null>(null);
  const [stagedDeletions, setStagedDeletions] = useState<any[]>([]);
  const [isReportModalOpen, setIsReportModalOpen] = useState(false);

  const dateInputRef = useRef<HTMLInputElement>(null);

  const [isMobileActionsOpen, setIsMobileActionsOpen] = useState(false);
  const [isRecycleBinOpen, setIsRecycleBinOpen] = useState(false);
  const [confirmDeleteTx, setConfirmDeleteTx] = useState<any | null>(null);

  // Tracks nested selected product count to dynamically hide topbar actions
  const [selectedProductsCount, setSelectedProductsCount] = useState(0);

  const getProductThumbnail = (productId: string) => {
    const matched = products.find(p => p.id === productId);
    return matched?.image_url || matched?.image || null;
  };

  const handleDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.value) return;
    const pickedDate = new Date(e.target.value);
    
    if (!isTabSelectable(pickedDate)) {
      toast.warning(role === 'staff' ? 'Staff members are only allowed to view today’s records.' : 'You cannot select dates in the future.');
      return;
    }

    const newWeekStart = startOfWeek(pickedDate, { weekStartsOn: 0 });
    const dayIndex = getDay(pickedDate);

    setCurrentWeekStart(newWeekStart);
    setSelectedDayIndex(dayIndex);
  };

  useEffect(() => {
    if (role !== 'admin') return;

    const handleSalesSlide = (e: Event) => {
      const customEvent = e as CustomEvent<'register' | 'inventory'>;
      if (customEvent.detail === 'inventory') {
        navigate('/sales/products');
      } else {
        navigate('/sales');
      }
    };
    window.addEventListener('toggle-sales-view', handleSalesSlide);
    return () => window.removeEventListener('toggle-sales-view', handleSalesSlide);
  }, [navigate, role]);

  // Listens to product selection events triggered by Products component
  useEffect(() => {
    const handleSelectionChange = (e: Event) => {
      const customEvent = e as CustomEvent<number>;
      setSelectedProductsCount(customEvent.detail);
    };
    window.addEventListener('product-selection-change', handleSelectionChange);
    return () => {
      window.removeEventListener('product-selection-change', handleSelectionChange);
    };
  }, []);

  const fetchRatesConfig = async () => {
    try {
      const { data, error } = await supabase
        .from('rates_config')
        .select('*')
        .eq('id', 1)
        .single();
      if (!error && data) {
        setRatesConfig(data);
      }
    } catch (err) {
      console.error('Error fetching rates_config:', err);
    }
  };

  const fetchTransactions = async () => {
    try {
      setLoadingTransactions(true);
      let query = supabase
        .from('sales')
        .select('*')
        .is('deleted_at', null)
        .order('created_at', { ascending: false });

      if (role === 'staff') {
        const todayStart = new Date();
        todayStart.setHours(0, 0, 0, 0);
        query = query.gte('created_at', todayStart.toISOString());
      } else {
        const weekStart = startOfWeek(currentWeekStart, { weekStartsOn: 0 }).toISOString();
        const weekEnd = endOfWeek(currentWeekStart, { weekStartsOn: 0 }).toISOString();
        query = query.gte('created_at', weekStart).lte('created_at', weekEnd);
      }

      const { data, error } = await query;
      if (error) throw error;
      setTransactions(data || []);
    } catch (err) {
      console.error('Error loading sales ledger:', err);
    } finally {
      setLoadingTransactions(false);
    }
  };

  const fetchProducts = async () => {
    try {
      const { data, error } = await supabase
        .from('products')
        .select('*')
        .is('deleted_at', null)
        .order('product_name', { ascending: true });
      if (error) throw error;
      setProducts(data || []);
    } catch (err) {
      console.error('Error loading products list:', err);
    }
  };

  useEffect(() => {
    fetchRatesConfig();
    fetchProducts();
    fetchTransactions();

    const salesChannel = supabase
      .channel('sales-realtime-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'sales' }, () => {
        fetchTransactions();
      })
      .subscribe();

    const productsChannel = supabase
      .channel('products-realtime-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'products' }, () => {
        fetchProducts();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(salesChannel);
      supabase.removeChannel(productsChannel);
    };
  }, [currentWeekStart, role]);

  const isCurrentWeek = useMemo(() => {
    const realWeekStart = startOfWeek(new Date(), { weekStartsOn: 0 });
    return startOfDay(currentWeekStart).getTime() >= startOfDay(realWeekStart).getTime();
  }, [currentWeekStart]);

  const isTabSelectable = (date: Date) => {
    const today = new Date();
    if (role === 'staff') {
      return isToday(date);
    } else {
      return startOfDay(date).getTime() <= startOfDay(today).getTime();
    }
  };

  useEffect(() => {
    const activeDate = addDays(currentWeekStart, selectedDayIndex);
    if (!isTabSelectable(activeDate)) {
      let fallbackIndex = 0;
      for (let i = 6; i >= 0; i--) {
        if (isTabSelectable(addDays(currentWeekStart, i))) {
          fallbackIndex = i;
          break;
        }
      }
      setSelectedDayIndex(fallbackIndex);
    }
    setCurrentPage(1);
  }, [currentWeekStart, role]);

  const selectedDate = useMemo(() => {
    return addDays(currentWeekStart, selectedDayIndex);
  }, [currentWeekStart, selectedDayIndex]);

  const stickyHeaderDateText = useMemo(() => {
    if (role === 'admin') {
      const weekEnd = endOfWeek(currentWeekStart, { weekStartsOn: 0 });
      if (format(currentWeekStart, 'MMM') === format(weekEnd, 'MMM')) {
        return `${format(currentWeekStart, 'MMMM d')} — ${format(weekEnd, 'd, yyyy')}`;
      } else {
        return `${format(currentWeekStart, 'MMMM d')} — ${format(weekEnd, 'MMMM d, yyyy')}`;
      }
    } else {
      return format(selectedDate, 'EEEE, MMMM d, yyyy');
    }
  }, [role, selectedDate, currentWeekStart]);

  const dayTransactions = useMemo(() => {
    const dateStr = format(selectedDate, 'yyyy-MM-dd');
    return transactions.filter((t: any) => {
      const transactionDate = t.created_at ? format(new Date(t.created_at), 'yyyy-MM-dd') : '';
      return transactionDate === dateStr;
    });
  }, [selectedDate, transactions]);

  const filteredDayTransactions = useMemo(() => {
    return dayTransactions.filter((t: any) => {
      const q = ledgerSearch.toLowerCase();
      return (
        t.product_name?.toLowerCase().includes(q) ||
        t.receipt_no?.toLowerCase().includes(q) ||
        t.id?.toLowerCase().includes(q) ||
        t.payment_method?.toLowerCase().includes(q)
      );
    });
  }, [dayTransactions, ledgerSearch]);

  const totalItems = filteredDayTransactions.length;
  const totalPages = Math.ceil(totalItems / itemsPerPage) || 1;
  const clampedPage = Math.min(Math.max(currentPage, 1), totalPages);

  const paginatedTransactions = useMemo(() => {
    const startIdx = (clampedPage - 1) * itemsPerPage;
    return filteredDayTransactions.slice(startIdx, startIdx + itemsPerPage);
  }, [filteredDayTransactions, clampedPage, itemsPerPage]);

  const startIndex = (clampedPage - 1) * itemsPerPage;

  const dailyRevenue = useMemo(() => {
    return dayTransactions.reduce((acc, t) => acc + (Number(t.total_amount) || 0), 0);
  }, [dayTransactions]);

  const dailyCount = useMemo(() => {
    return dayTransactions.length;
  }, [dayTransactions]);

  const handleSaleSuccess = async (newTx: any) => {
    setLoading(true);
    try {
      const calculatedGcashFee = newTx.paymentMethod === 'GCash' ? (ratesConfig?.gcash_fee || 10.00) : 0.00;

      const { error } = await supabase
        .from('sales')
        .insert([{
          items: newTx.items,
          product_name: newTx.productName,
          payment_method: newTx.paymentMethod,
          amount_received: newTx.amountReceived,
          change_calculated: newTx.changeCalculated,
          total_amount: newTx.totalAmount,
          gcash_fee_applied: calculatedGcashFee
        }])
        .select()
        .single();

      if (error) throw error;

      if (newTx.items && Array.isArray(newTx.items)) {
        for (const item of newTx.items) {
          const { data: currentProduct } = await supabase
            .from('products')
            .select('stock_quantity')
            .eq('id', item.productId)
            .single();

          if (currentProduct) {
            const currentStock = currentProduct.stock_quantity ?? 0;
            const updatedStock = Math.max(0, currentStock - item.quantity);
            
            await supabase
              .from('products')
              .update({ stock_quantity: updatedStock })
              .eq('id', item.productId);
          }
        }
      }

      // Log action in audit history with Tab/Newline formatting
      const itemsList = newTx.items?.map((i: any) => `\t- ${i.productName} (${i.quantity}x)`).join('\n') || `\t- ${newTx.productName}`;
      const auditDetails = `Recorded sale transaction: ${newTx.id}\n` +
        `Payment Method: ${newTx.paymentMethod}\n` +
        `Total Amount: ₱${newTx.totalAmount.toFixed(2)}\n\n` +
        `Items Purchased:\n${itemsList}`;

      await supabase.from('audit_logs').insert([{
        action: 'SALE_RECORDED',
        details: auditDetails,
        actor_username: user?.email || 'System'
      }]);

      // Friendly non-technical success summary toast
      if (newTx.items && newTx.items.length === 1) {
        const singleItem = newTx.items[0];
        toast.success(`Success! ${singleItem.productName} (${singleItem.quantity}x) has been successfully saved to your sale.`);
      } else if (newTx.items && newTx.items.length > 1) {
        const summaryText = newTx.items.map((i: any) => `${i.productName} (${i.quantity}x)`).join(', ');
        toast.success(`Success! Saved to your sale: ${summaryText}.`);
      } else {
        toast.success('Your sale has been successfully saved.');
      }

      fetchTransactions();
      fetchProducts();
    } catch (err) {
      console.error(err);
      toast.error('There was a problem saving your transaction. Please try again.');
    } 
  };

  const handleDeleteTransaction = (tx: any) => {
    if (!isTransactionDeletable(tx)) {
      toast.error('Only sales made today can be deleted.');
      return;
    }

    setStagedDeletions(prev => [...prev, tx]);
    setTransactions(prev => prev.filter(t => t.id !== tx.id));
  };

  const handleConfirmDelete = async (stagedTx: any) => {
    try {
      const { error } = await supabase
        .from('sales')
        .delete()
        .eq('id', stagedTx.id);

      if (error) throw error;

      // Log action in audit history with Tab/Newline formatting
      const itemsList = stagedTx.items?.map((i: any) => `\t- ${i.productName || i.product_name} (${i.quantity}x)`).join('\n') || `\t- ${stagedTx.product_name}`;
      const auditDetails = `Moved sale transaction to Recycle Bin: ${stagedTx.receipt_no || stagedTx.id}\n` +
        `Payment Method: ${stagedTx.payment_method || stagedTx.paymentMethod || 'Cash'}\n` +
        `Total Amount: ₱${Number(stagedTx.total_amount || stagedTx.totalAmount || 0).toFixed(2)}\n\n` +
        `Items Removed:\n${itemsList}`;

      await supabase.from('audit_logs').insert([{
        action: 'SALE_REMOVED',
        details: auditDetails,
        actor_username: user?.email || 'System'
      }]);

      toast.success('This sale has been deleted and moved to your Recycle Bin.');
    } catch (err) {
      console.error(err);
      toast.error('There was a problem deleting this sale. Please try again.');
    } finally {
      setStagedDeletions(prev => prev.filter(t => t.id !== stagedTx.id));
      fetchTransactions();
      fetchProducts();
    }
  };

  const handleUndoDelete = (stagedTx: any) => {
    setTransactions(prev => [stagedTx, ...prev].sort((a, b) => {
      const dateA = a.created_at || a.createdAt || '';
      const dateB = b.created_at || b.createdAt || '';
      return dateB.localeCompare(dateA);
    }));
    setStagedDeletions(prev => prev.filter(t => t.id !== stagedTx.id));
    toast.info('Deletion canceled. The transaction has been put back.');
  };

  // Synchronize topbar header actions on layout mounts
  useEffect(() => {
    if ((activeView as string) === 'register') {
      setActions(
        <div className="flex flex-wrap items-center gap-3 w-full sm:w-auto justify-end animate-fade-in">
          
          {/* Standardized Today's Sales Status Box */}
<div className="hidden lg:flex items-center gap-3 px-5 py-2 bg-slate-100 dark:bg-zinc-900 border border-(--border-color) rounded-2xl select-none leading-none shadow-sm shrink-0 animate-fade-in">
  <div className="text-left">
    <span className="text-[9px] font-heading tracking-widest text-slate-400 dark:text-slate-500 block uppercase">TODAY'S SALES</span>
    <span className="text-lg font-heading text-(--color-primary) block mt-1.5 tracking-wider">
      ₱{dailyRevenue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
    </span>
  </div>
</div>

          {role === 'admin' && (
            <>
              <Button
  onClick={() => setIsRecycleBinOpen(true)}
  variant="secondary"
  className="py-2 px-3.5 w-auto! text-xs flex items-center gap-1.5 cursor-pointer font-bold animate-fade-in"
>
  <RotateCcw className="w-4 h-4 text-amber-500" />
  <span>RECYCLE BIN</span>
</Button>

              <Button
                onClick={() => setIsReportModalOpen(true)}
                variant="secondary"
                className="py-2 px-3.5 w-auto! text-xs flex items-center gap-1.5 cursor-pointer font-bold animate-fade-in"
              >
                <FileSpreadsheet className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                <span>GENERATE REPORT</span>
              </Button>
            </>
          )}

          <Button
            onClick={() => setIsCreateModalOpen(true)}
            variant="primary"
            className="hidden md:flex py-2 px-3.5 w-auto! text-xs items-center gap-1.5 shadow-md cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>NEW SALE</span>
          </Button>
        </div>
      );
    } else {
      // activeView === 'inventory'
      // Hide header actions if items are selected
      if (selectedProductsCount > 0) {
        setActions(null);
      } else {
        setActions(
          <div className="flex flex-wrap items-center gap-3 w-full sm:w-auto justify-end animate-fade-in">
            
           <div className="hidden lg:flex items-center gap-3 px-5 py-2 bg-slate-100 dark:bg-zinc-900 border border-(--border-color) rounded-2xl select-none leading-none shadow-sm shrink-0 animate-fade-in">
  <div className="text-left">
    <span className="text-[9px] font-heading tracking-widest text-slate-400 dark:text-slate-500 block uppercase">TODAY'S SALES</span>
    <span className="text-lg font-heading text-(--color-primary) block mt-1.5 tracking-wider">
      ₱{dailyRevenue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
    </span>
  </div>
</div>

<Button
  onClick={() => window.dispatchEvent(new CustomEvent('trigger-product-recovery'))}
  variant="secondary"
  className="py-2 px-3.5 w-auto! text-xs flex items-center gap-1.5 cursor-pointer font-bold animate-fade-in"
  title="View and restore soft-deleted products"
>
  <RotateCcw className="w-4 h-4 text-amber-500" />
  <span>RECYCLE BIN</span>
</Button>

            <Button
  onClick={() => window.dispatchEvent(new CustomEvent('trigger-product-print'))}
  variant="secondary"
  className="py-2 px-3.5 w-auto! text-xs flex items-center gap-1.5 cursor-pointer font-bold animate-fade-in"
>
  <Printer className="w-4 h-4 text-blue-500" />
  <span>PRINT SHEET LABELS</span>
</Button>

           <Button
  onClick={() => window.dispatchEvent(new CustomEvent('trigger-product-create'))}
  variant="primary"
  className="py-2 px-3.5 w-auto! text-xs flex items-center gap-1.5 cursor-pointer font-bold animate-fade-in"
>
  <Plus className="w-4 h-4" />
  <span>ADD NEW ITEM</span>
</Button>
          </div>
        );
      }
    }

    return () => setActions(null);
  }, [role, products, transactions, activeView, dailyRevenue, ratesConfig, selectedProductsCount]);

  return (
    <div className="relative min-h-[85vh] w-full animate-fade-in">
      <TabLoader isVisible={loading} />

      {/* --- DESKTOP NAVIGATION TABS (ADMIN ONLY) --- */}
      {role === 'admin' && (
        <div className="hidden xl:block">
          <AnimatePresence>
            {activeView === 'register' ? (
              <motion.button
                key="to-inventory-arrow"
                initial={{ opacity: 0, x: 30 }}
                animate={{ opacity: 0.9, x: 0 }}
                exit={{ opacity: 0, x: 30 }}
                whileHover={{ scale: 1.02 }}
                onClick={() => handlePcViewTransition('inventory')}
                className="group fixed right-0 top-1/2 -translate-y-1/2 bg-(--bg-card)/90 backdrop-blur-md border-y border-l border-(--border-color) pl-5 pr-4 py-6 rounded-l-3xl shadow-2xl cursor-pointer flex items-center gap-3 z-45 transition-colors hover:border-(--color-primary-light)/40 hover:bg-(--bg-card)"
              >
                <div className="text-right">
                  <span className="text-[8px] font-bold text-slate-400 block tracking-widest uppercase">View Store</span>
                  <span className="font-heading text-[10px] text-(--color-text) tracking-wider uppercase block mt-0.5 group-hover:text-(--color-primary-light) transition-colors">INVENTORY</span>
                </div>
                <motion.div 
                  animate={{ x: [0, 4, 0] }} 
                  transition={{ repeat: Infinity, duration: 1.5, ease: 'easeInOut' }}
                >
                  <ChevronRight className="w-5 h-5 text-(--color-primary-light)" />
                </motion.div>
              </motion.button>
            ) : (
              <motion.button
                key="to-register-arrow"
                initial={{ opacity: 0, x: -30 }}
                animate={{ opacity: 0.9, x: 0 }}
                exit={{ opacity: 0, x: -30 }}
                whileHover={{ scale: 1.02 }}
                onClick={() => handlePcViewTransition('register')}
                className="group fixed left-0 top-1/2 -translate-y-1/2 bg-(--bg-card)/90 backdrop-blur-md border-y border-r border-(--border-color) pl-4 pr-5 py-6 rounded-r-3xl shadow-2xl cursor-pointer flex items-center gap-3 z-45 transition-colors hover:border-(--color-primary-light)/40 hover:bg-(--bg-card)"
              >
                <motion.div 
                  animate={{ x: [0, -4, 0] }} 
                  transition={{ repeat: Infinity, duration: 1.5, ease: 'easeInOut' }}
                >
                  <ChevronLeft className="w-5 h-5 text-(--color-primary-light)" />
                </motion.div>
                <div className="text-left">
                  <span className="text-[8px] font-bold text-slate-400 block tracking-widest uppercase">View Cashier</span>
                  <span className="font-heading text-[10px] text-(--color-text) tracking-wider uppercase block mt-0.5 group-hover:text-(--color-primary-light) transition-colors">REGISTER</span>
                </div>
              </motion.button>
            )}
          </AnimatePresence>
        </div>
      )}

      {/* --- TIMELINE CANVAS SCROLLER --- */}
      <div className="relative w-full h-full min-h-[80vh] overflow-hidden grid grid-cols-1 items-start">
        
        {/* VIEW 1: CASHIER REGISTER */}
        <div 
          className="w-full h-full space-y-6 max-w-4xl mx-auto px-6 sm:px-12 pb-36 animate-fade-in"
          style={{
            gridColumn: 1,
            gridRow: 1,
            transform: activeView === 'register' ? 'translate3d(0, 0, 0)' : 'translate3d(-101%, 0, 0)',
            opacity: activeView === 'register' ? 1 : 0,
            pointerEvents: activeView === 'register' ? 'auto' : 'none',
            transition: 'transform 800ms cubic-bezier(0.77, 0, 0.175, 1), opacity 800ms cubic-bezier(0.77, 0, 0.175, 1)'
          }}
        >
          {/* WEEKLY TIMELINE SCROLLER */}
          <div className="sticky top-0 z-30 bg-(--bg-page)/95 backdrop-blur-md pt-2 pb-4 -mx-6 px-6 sm:-mx-12 sm:px-12 border-b border-(--border-color) shadow-xs flex flex-col gap-4 animate-slide-down">
            <div className="flex items-center justify-between gap-2">
              
              {role === 'admin' ? (
                <button
                  onClick={() => setCurrentWeekStart(prev => subWeeks(prev, 1))}
                  className="p-2 border border-(--border-color) rounded-xl hover:bg-slate-100 dark:hover:bg-zinc-800 disabled:opacity-40 transition-all cursor-pointer"
                >
                  <ChevronLeft className="w-5 h-5 text-(--color-text)" />
                </button>
              ) : (
                <div className="w-10 h-10 hidden sm:block" /> 
              )}

              <div className="text-center flex-1">
                <div 
                  onClick={() => dateInputRef.current?.showPicker()} 
                  className="text-center cursor-pointer hover:opacity-80 active:scale-98 transition-all inline-block relative"
                >
                  <span className="text-[10px] font-heading text-slate-555 dark:text-slate-455 tracking-widest block uppercase">
                    {role === 'admin' ? 'SELECTED WEEK DATE' : 'SELECTED DAY DATE'}
                  </span>
                  <span className="font-heading text-xs sm:text-sm text-(--color-primary-light) tracking-wider block mt-0.5">
                    {stickyHeaderDateText}
                  </span>
                  
                  <input 
                    ref={dateInputRef}
                    type="date"
                    onChange={handleDateChange}
                    className="absolute inset-0 opacity-0 cursor-pointer pointer-events-none"
                  />
                </div>
              </div>

              <div className="flex items-center gap-2">
                {!isCurrentWeek && role === 'admin' && (
                  <button
                    onClick={() => setCurrentWeekStart(startOfWeek(new Date(), { weekStartsOn: 0 }))}
                    className="p-2 text-xs text-(--color-primary) bg-(--color-primary)/10 font-sans tracking-wider rounded-xl flex items-center gap-1 font-bold hover:bg-(--color-primary)/20 transition-all cursor-pointer"
                    title="Return to Current Week"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span className="hidden sm:inline">CURRENT</span>
                  </button>
                )}
                
                {role === 'admin' ? (
                  <button
                    onClick={() => setCurrentWeekStart(prev => addWeeks(prev, 1))}
                    disabled={isCurrentWeek}
                    className="p-2 border border-(--border-color) rounded-xl hover:bg-slate-100 dark:hover:bg-zinc-800 disabled:opacity-40 transition-all cursor-pointer"
                  >
                    <ChevronRight className="w-5 h-5 text-(--color-text)" />
                  </button>
                ) : (
                  <div className="w-10 h-10 hidden sm:block" />
                )}
              </div>
            </div>

            <div className="grid grid-cols-7 gap-1 sm:gap-2">
              {DAYS_OF_WEEK.map((day: string, idx: number) => {
                const date = addDays(currentWeekStart, idx);
                const active = selectedDayIndex === idx;
                const selectable = isTabSelectable(date);
                const isTodayDate = isToday(date);

                return (
                  <button
                    key={day}
                    onClick={() => selectable && setSelectedDayIndex(idx)}
                    disabled={!selectable}
                    className={`py-3 px-1 sm:px-2 rounded-xl flex flex-col items-center justify-center transition-all relative ${
                      active 
                        ? 'bg-[#123c73] dark:bg-[#bf0202] text-white shadow-md scale-[1.03] z-10' 
                        : selectable 
                          ? 'bg-slate-100 hover:bg-slate-200 dark:bg-zinc-900 dark:hover:bg-zinc-800 text-slate-700 dark:text-slate-300' 
                          : 'bg-transparent text-slate-350 dark:text-zinc-755 opacity-40 cursor-not-allowed'
                    }`}
                  >
                    <span className="text-[9px] font-heading tracking-wider">{day}</span>
                    <span className="text-xs font-sans font-extrabold mt-1">{format(date, 'd')}</span>
                    
                    {isTodayDate && (
                      <span className={`absolute bottom-1 w-1.5 h-1.5 rounded-full ${active ? 'bg-white' : 'bg-(--color-primary)'}`}></span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* SEARCH TOOLBAR */}
          <div className="field-wrap">
            <input
              type="text"
              placeholder=" "
              value={ledgerSearch}
              onChange={(e) => setLedgerSearch(e.target.value)}
              className="field-input pr-10"
            />
            <label className="field-label">
              <Search className="w-3.5 h-3.5" />
              Search Transactions (Name, Receipt, Ref, Method)
            </label>
            {ledgerSearch && (
              <button 
                onClick={() => setLedgerSearch('')} 
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-650 dark:hover:text-slate-200 text-xs font-bold"
              >
                CLEAR
              </button>
            )}
          </div>

          {/* --- HOURLY LEDGER TIMELINE (Chronologically Segmented) --- */}
          <div className="space-y-6">
            <AnimatePresence mode="popLayout">
              {(() => {
                // Render loading skeletons while transactions are fetching
                if (loadingTransactions) {
                  return (
                    <div className="space-y-3">
                      {Array.from({ length: 3 }).map((_, idx) => (
                        <TransactionSkeleton key={idx} />
                      ))}
                    </div>
                  );
                }

                const hourlyGroups: { label: string; txs: any[] }[] = [];
                
                paginatedTransactions.forEach(tx => {
                  const rawTime = tx.created_at || tx.createdAt;
                  let hourLabel = 'Unknown Time';
                  if (rawTime) {
                    try {
                      const date = parseISO(rawTime);
                      hourLabel = format(date, 'hh:00 a');
                    } catch (e) {
                      console.error(e);
                    }
                  }
                  
                  const existingGroup = hourlyGroups.find(g => g.label === hourLabel);
                  if (existingGroup) {
                    existingGroup.txs.push(tx);
                  } else {
                    hourlyGroups.push({ label: hourLabel, txs: [tx] });
                  }
                });

                if (totalItems === 0) {
                  return (
                    <motion.div
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      className="rounded-2xl border border-dashed border-(--border-color) p-12 text-center flex flex-col items-center justify-center"
                    >
                      <div className="w-16 h-16 rounded-full bg-slate-100 dark:bg-zinc-900 flex items-center justify-center text-slate-450 dark:text-zinc-600 mb-4 animate-pulse">
                        <ShoppingBag className="w-8 h-8" />
                      </div>
                      <h3 className="font-heading text-sm text-(--color-text) tracking-wider">NO TRANSACTIONS LOGGED</h3>
                      <p className="text-xs text-slate-500 max-w-xs mx-auto mt-1 font-body">
                        No purchases or entries have been recorded for this specific date slot.
                      </p>
                    </motion.div>
                  );
                }

                const handleDragEnd = (_event: any, info: any, tx: any) => {
                  const swipeThreshold = 80;
                  if (info.offset.x > swipeThreshold) {
                    setSelectedReceiptTx(tx);
                  } else if (info.offset.x < -swipeThreshold) {
                    if (isTransactionDeletable(tx)) {
                      setConfirmDeleteTx(tx);
                    } else {
                      toast.warning('Rollback Lock: Only current day sales can be removed.');
                    }
                  }
                };

                return hourlyGroups.map((group) => (
                  <div key={group.label} className="space-y-4">
                    <div className="flex items-center gap-3 select-none pt-2 animate-fade-in">
                      <div className="text-[9px] font-heading font-black tracking-widest text-(--color-primary-light) bg-(--color-primary)/10 border border-(--color-primary)/10 px-3 py-1 rounded-full uppercase shrink-0">
                        {group.label}
                      </div>
                      <div className="h-px flex-1 bg-linear-to-r from-(--border-color) to-transparent" />
                    </div>

                    <div className="space-y-2.5">
                      {group.txs.map((tx) => (
                        <TransactionCard
                          key={tx.id}
                          tx={tx}
                          canDeleteTx={isTransactionDeletable(tx)}
                          onSelectReceipt={setSelectedReceiptTx}
                          onTriggerDelete={setConfirmDeleteTx}
                          onDragEnd={handleDragEnd}
                        />
                      ))}
                    </div>
                  </div>
                ));
              })()}
            </AnimatePresence>
          </div>

          {/* CARD MULTI-ITEM AUTOMATED PAGINATION CONTROLS */}
          {totalItems > 0 && totalPages > 1 && (
            <div className="flex flex-col sm:flex-row items-center justify-between gap-4 mt-4 px-1 py-2 text-xs font-body animate-fade-in">
              <span className="text-slate-500 dark:text-slate-400">
                Showing <span className="font-semibold text-slate-900 dark:text-white">{startIndex + 1}</span> to{' '}
                <span className="font-semibold text-slate-900 dark:text-white">{Math.min(startIndex + itemsPerPage, totalItems)}</span> of{' '}
                <span className="font-semibold text-slate-900 dark:text-white">{totalItems}</span> entries
              </span>

              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                  disabled={clampedPage === 1}
                  className="p-1.5 border border-(--border-color) rounded-lg hover:bg-slate-100 dark:hover:bg-neutral-800 text-slate-700 dark:text-slate-300 disabled:opacity-40 disabled:pointer-events-none transition-all cursor-pointer inline-flex items-center justify-center"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>

                {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => (
                  <button
                    key={page}
                    type="button"
                    onClick={() => setCurrentPage(page)}
                    className={`px-3 py-1.5 rounded-lg font-mono font-semibold transition-all cursor-pointer ${
                      clampedPage === page
                        ? 'bg-[#1b365d] dark:bg-[#bf0202] text-white'
                        : 'border border-(--border-color) text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-neutral-800'
                    }`}
                  >
                    {page}
                  </button>
                ))}

                <button
                  type="button"
                  onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
                  disabled={clampedPage === totalPages}
                  className="p-1.5 border border-(--border-color) rounded-lg hover:bg-slate-100 dark:hover:bg-neutral-800 text-slate-700 dark:text-slate-300 disabled:opacity-40 disabled:pointer-events-none transition-all cursor-pointer inline-flex items-center justify-center"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}
        </div>

        {/* --- VIEW 2: PRODUCTS INVENTORY (ADMINS ONLY) --- */}
        {role === 'admin' && (
          <div 
            className="w-full h-full pb-36 max-w-full"
            style={{
              gridColumn: 1,
              gridRow: 1,
              transform: activeView === 'inventory' ? 'translate3d(0, 0, 0)' : 'translate3d(101%, 0, 0)',
              opacity: activeView === 'inventory' ? 1 : 0,
              pointerEvents: activeView === 'inventory' ? 'auto' : 'none',
              transition: 'transform 800ms cubic-bezier(0.77, 0, 0.175, 1), opacity 800ms cubic-bezier(0.77, 0, 0.175, 1)'
            }}
          >
            <Products hideHeaderActions={true} />
          </div>
        )}

      </div>

      {/* CREATE TRANSACTION MODAL DIALOG */}
      {isCreateModalOpen && (
        <SalesDialog
          isOpen={isCreateModalOpen}
          onClose={() => setIsCreateModalOpen(false)}
          products={products}
          onSaleSuccess={handleSaleSuccess}
        />
      )}

      {/* DYNAMIC REPORTS COMPILER OVERLAY */}
      {isReportModalOpen && (
        <SalesReportCompiler
          isOpen={isReportModalOpen}
          onClose={() => setIsReportModalOpen(false)}
          transactions={transactions}
        />
      )}

      {/* OFFICIAL RECEIPTS OVERLAY */}
      {selectedReceiptTx && (
        <SalesOfficialReceipt
          isOpen={!!selectedReceiptTx}
          onClose={() => setSelectedReceiptTx(null)}
          tx={selectedReceiptTx}
        />
      )}

      {/* DAILY RECYCLE BIN MODAL */}
      {isRecycleBinOpen && (
        <SalesRecycleBin
          isOpen={isRecycleBinOpen}
          onClose={() => setIsRecycleBinOpen(false)}
          products={products}
          onRestoreSuccess={() => {
            fetchTransactions();
            fetchProducts();
          }}
        />
      )}

      {/* --- DETACHED CUSTOM REMOVAL CONFIRMATION MODAL --- */}
      {confirmDeleteTx && (
        <Modal
          isOpen={!!confirmDeleteTx}
          onClose={() => setConfirmDeleteTx(null)}
          title="REMOVE TRANSACTION"
          className="max-w-sm text-center p-6 animate-fade-in"
        >
          <div className="space-y-4 pt-1 font-body text-xs text-slate-500 dark:text-slate-400 text-left">
            <p className="leading-relaxed text-center text-slate-600 dark:text-slate-450">
              Are you sure you want to remove this transaction?
            </p>

            <div className="space-y-2.5 max-h-48 overflow-y-auto pr-1">
              {confirmDeleteTx.items && Array.isArray(confirmDeleteTx.items) ? (
                confirmDeleteTx.items.map((item: any, idx: number) => {
                  const imageUrl = getProductThumbnail(item.productId);
                  return (
                    <div 
                      key={idx} 
                      className="flex items-center gap-3 p-2.5 rounded-xl bg-slate-100 dark:bg-zinc-900 border border-(--border-color)"
                    >
                      {imageUrl ? (
                        <img 
                          src={imageUrl} 
                          alt={item.productName || item.product_name} 
                          className="w-10 h-10 rounded-lg object-cover border border-(--border-color) shrink-0" 
                        />
                      ) : (
                        <div className="w-10 h-10 rounded-lg bg-(--bg-page) border border-(--border-color) flex items-center justify-center text-slate-400 font-bold text-xs shrink-0 select-none uppercase">
                          {(item.productName || item.product_name || 'P')[0]}
                        </div>
                      )}
                      
                      <div className="min-w-0 flex-1 text-left">
                        <span className="font-semibold block truncate text-xs text-slate-900 dark:text-white">
                          {item.productName || item.product_name}
                        </span>
                        <span className="text-[10px] text-slate-400 font-medium block mt-0.5">
                          Quantity: {item.quantity} • Price: ₱{Number(item.price).toFixed(2)}
                        </span>
                      </div>
                    </div>
                  );
                })
              ) : (
                <div className="flex items-center gap-3 p-2.5 rounded-xl bg-slate-100 dark:bg-zinc-900 border border-(--border-color)">
                  <div className="w-10 h-10 rounded-lg bg-(--bg-page) border border-(--border-color) flex items-center justify-center text-slate-450 font-bold text-xs shrink-0 select-none">
                    T
                  </div>
                  <div className="min-w-0 flex-1 text-left">
                    <span className="font-semibold block truncate text-xs text-slate-900 dark:text-white">
                      {confirmDeleteTx.product_name || confirmDeleteTx.productName}
                    </span>
                    <span className="text-[10px] text-slate-400 font-medium block mt-0.5">
                      Quantity: {confirmDeleteTx.quantity || 1} • Price: ₱{Number(confirmDeleteTx.total_amount || confirmDeleteTx.totalAmount || 0).toFixed(2)}
                    </span>
                  </div>
                </div>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3 pt-2">
              <button
                type="button"
                onClick={() => setConfirmDeleteTx(null)}
                className="py-2.5 border border-(--border-color) bg-(--bg-card) hover:bg-slate-500/5 text-slate-500 dark:text-slate-400 rounded-xl font-heading text-[10px] tracking-wider uppercase cursor-pointer transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  handleDeleteTransaction(confirmDeleteTx);
                  setConfirmDeleteTx(null);
                }}
                className="py-2.5 bg-red-500 hover:bg-red-600 text-white rounded-xl font-heading text-[10px] tracking-wider uppercase cursor-pointer shadow-md transition-all font-bold"
              >
                Remove
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* --- DETACHED CUSTOM REMOVAL CONFIRMATION NOTIFIER --- */}
      <div className="fixed bottom-40 md:bottom-28 lg:bottom-8 left-1/2 -translate-x-1/2 z-3000 flex flex-col gap-2 w-[calc(100vw-24px)] md:w-auto items-center pointer-events-none">
        <AnimatePresence mode="popLayout">
          {stagedDeletions.map((stagedTx) => (
            <UndoToast
              key={stagedTx.id}
              isOpen={true}
              message={`Removing transaction ${stagedTx.receipt_no || stagedTx.id} from database ledger...`}
              duration={5}
              onConfirm={() => handleConfirmDelete(stagedTx)}
              onUndo={() => handleUndoDelete(stagedTx)}
              onClose={() => {
                setStagedDeletions(prev => prev.filter(t => t.id !== stagedTx.id));
              }}
            />
          ))}
        </AnimatePresence>
      </div>

      {/* MOBILE STICKY BOTTOM BAR FOR CASHIER REGISTER */}
      {activeView === 'register' && (
        <>
          <AnimatePresence>
            {isMobileActionsOpen && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => setIsMobileActionsOpen(false)}
                className="md:hidden fixed inset-0 bg-black/60 backdrop-blur-xs z-35"
              />
            )}
          </AnimatePresence>

          <div className="md:hidden fixed bottom-36 right-6 z-40 flex flex-col items-end gap-3.5">
            <AnimatePresence>
              {isMobileActionsOpen && (
                <motion.div 
                  initial={{ opacity: 0, y: 15, scale: 0.9 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 15, scale: 0.9 }}
                  className="flex flex-col items-end gap-2.5 mb-1"
                >
                  {role === 'admin' && (
                    <button
                      onClick={() => { setIsMobileActionsOpen(false); setIsRecycleBinOpen(true); }}
                      className="flex items-center gap-2.5 px-4 py-2.5 bg-slate-900/95 dark:bg-neutral-900/95 text-slate-100 border border-white/5 text-[9px] font-heading tracking-widest uppercase rounded-2xl shadow-xl cursor-pointer"
                    >
                      <RotateCcw className="w-4 h-4 text-amber-500" />
                      <div className="text-right">
                        <span className="block">Recycle Bin</span>
                        <span className="block text-[7px] text-slate-400 font-sans font-bold capitalize">Clears at end of day</span>
                      </div>
                    </button>
                  )}

                  {role === 'admin' && (
                    <button
                      onClick={() => { setIsMobileActionsOpen(false); setIsReportModalOpen(true); }}
                      className="flex items-center gap-2.5 px-4 py-2.5 bg-slate-900/95 dark:bg-neutral-900/95 text-slate-100 border border-white/5 text-[9px] font-heading tracking-widest uppercase rounded-2xl shadow-xl cursor-pointer"
                    >
                      <FileSpreadsheet className="w-4 h-4 text-emerald-500" />
                      <span>Generate Report</span>
                    </button>
                  )}
                  
                  <button
                    onClick={() => { setIsMobileActionsOpen(false); setIsCreateModalOpen(true); }}
                    className="flex items-center gap-2.5 px-4 py-2.5 bg-slate-900/95 dark:bg-neutral-900/95 text-slate-100 border border-white/5 text-[9px] font-heading tracking-widest uppercase rounded-2xl shadow-xl cursor-pointer"
                  >
                    <Plus className="w-4 h-4 text-blue-500" />
                    <span>New Sale</span>
                  </button>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          <div className="md:hidden fixed bottom-16 left-0 right-0 h-20 bg-(--bg-card)/90 backdrop-blur-md border-t border-(--border-color) flex items-center justify-between px-6 z-40 shadow-[0_-4px_20px_rgba(0,0,0,0.15)] transition-colors duration-300">
            <div className="space-y-0.5 text-left select-none">
              <span className="text-[9px] font-heading tracking-widest text-slate-400 dark:text-slate-500 uppercase leading-none block">
                TODAY'S REVENUE
              </span>
              <span className="text-xl font-heading text-(--color-primary) block leading-none pt-0.5">
                ₱{dailyRevenue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
              <span className="text-[9px] font-sans text-slate-500 block leading-none font-semibold">
                {dailyCount} Transactions Completed
              </span>
            </div>

            <motion.button
              type="button"
              whileTap={{ scale: 0.9 }}
              onClick={() => setIsMobileActionsOpen(!isMobileActionsOpen)}
              className="flex items-center justify-center w-12 h-12 text-white rounded-full cursor-pointer bg-[#10b981] hover:bg-emerald-600 border border-white/10 shadow-lg"
              title="New Sale Transaction"
            >
              <Plus className="w-5.5 h-5.5" />
            </motion.button>
          </div>
        </>
      )}

      {/* MOBILE STICKY BOTTOM BAR FOR PRODUCTS INVENTORY */}
      {activeView === 'inventory' && selectedProductsCount === 0 && (
        <>
          <AnimatePresence>
            {isMobileActionsOpen && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => setIsMobileActionsOpen(false)}
                className="md:hidden fixed inset-0 bg-black/60 backdrop-blur-xs z-35"
              />
            )}
          </AnimatePresence>

          <div className="md:hidden fixed bottom-36 right-6 z-40 flex flex-col items-end gap-3.5">
            <AnimatePresence>
              {isMobileActionsOpen && (
                <motion.div 
                  initial={{ opacity: 0, y: 15, scale: 0.9 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 15, scale: 0.9 }}
                  className="flex flex-col items-end gap-2.5 mb-1"
                >
                  <button
                    onClick={() => {
                      setIsMobileActionsOpen(false);
                      window.dispatchEvent(new CustomEvent('trigger-product-recovery'));
                    }}
                    className="flex items-center gap-2.5 px-4 py-2.5 bg-slate-900/95 dark:bg-neutral-900/95 text-slate-100 border border-white/5 text-[9px] font-heading tracking-widest uppercase rounded-2xl shadow-xl cursor-pointer"
                  >
                    <RotateCcw className="w-4 h-4 text-amber-500" />
                    <span>Recycle Bin</span>
                  </button>

                  <button
                    onClick={() => {
                      setIsMobileActionsOpen(false);
                      window.dispatchEvent(new CustomEvent('trigger-product-print'));
                    }}
                    className="flex items-center gap-2.5 px-4 py-2.5 bg-slate-900/95 dark:bg-neutral-900/95 text-slate-100 border border-white/5 text-[9px] font-heading tracking-widest uppercase rounded-2xl shadow-xl cursor-pointer"
                  >
                    <Printer className="w-4 h-4 text-blue-500" />
                    <span>Print Sheet Labels</span>
                  </button>
                  
                  <button
                    onClick={() => {
                      setIsMobileActionsOpen(false);
                      window.dispatchEvent(new CustomEvent('trigger-product-create'));
                    }}
                    className="flex items-center gap-2.5 px-4 py-2.5 bg-slate-900/95 dark:bg-neutral-900/95 text-slate-100 border border-white/5 text-[9px] font-heading tracking-widest uppercase rounded-2xl shadow-xl cursor-pointer"
                  >
                    <Plus className="w-4 h-4 text-emerald-500" />
                    <span>Add New Item</span>
                  </button>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          <div className="md:hidden fixed bottom-16 left-0 right-0 h-20 bg-(--bg-card)/90 backdrop-blur-md border-t border-(--border-color) flex items-center justify-between px-6 z-40 shadow-[0_-4px_20px_rgba(0,0,0,0.15)] transition-colors duration-300">
            <div className="space-y-0.5 text-left select-none">
              <span className="text-[9px] font-heading tracking-widest text-slate-400 dark:text-slate-500 uppercase leading-none block">
                PRODUCT INVENTORY
              </span>
              <span className="text-xl font-heading text-(--color-primary) block leading-none pt-0.5">
                {products.length} Items Listed
              </span>
            </div>

            <motion.button
              type="button"
              whileTap={{ scale: 0.9 }}
              onClick={() => setIsMobileActionsOpen(!isMobileActionsOpen)}
              className="flex items-center justify-center w-12 h-12 text-white rounded-full cursor-pointer bg-[#10b981] hover:bg-emerald-600 border border-white/10 shadow-lg"
              title="Inventory Actions"
            >
              <Plus className="w-5.5 h-5.5" />
            </motion.button>
          </div>
        </>
      )}

    </div>
  );
};

export default Sales;