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
  getDay,
  parseISO 
} from 'date-fns';
import { 
  Plus, 
  ChevronLeft, 
  ChevronRight, 
  RotateCcw, 
  ShoppingBag, 
  FileSpreadsheet,
  Printer,
  CircleDollarSign,
  Package,
  Search
} from 'lucide-react';
import { motion, AnimatePresence, animate } from 'framer-motion';
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
import { TimelineBar } from '../../components/ui/TimelineBar';
import { HeaderActionsContext } from '../../routes';
import { SalesDialog } from './components/SalesDialog';
import { Products } from './Products'; 
import { useResponsiveItemsPerPage } from '../../lib/useResponsiveItemsPerPage';
import { SalesRecycleBin } from './components/SalesRecycleBin';

// Separated Modular Components
import { SalesReportCompiler } from './components/SalesReportCompiler';
import { OfficialReceipt } from '../../components/ui/OfficialReceipt';

// Unified UI TimelineCard
import { TimelineCard } from '../../components/ui/TimelineCard';

// ─── ANIMATED TICKER HELPERS ───
const AnimatedCurrency: React.FC<{ value: number }> = ({ value }) => {
  const nodeRef = useRef<HTMLSpanElement>(null);
  const prevValueRef = useRef(value);

  useEffect(() => {
    const node = nodeRef.current;
    if (!node) return;

    const controls = animate(prevValueRef.current, value, {
      duration: 1.1,
      ease: [0.16, 1, 0.3, 1],
      onUpdate(latest) {
        node.textContent = `₱${latest.toFixed(2)}`;
      },
      onComplete() {
        prevValueRef.current = value;
      }
    });

    return () => controls.stop();
  }, [value]);

  return <span ref={nodeRef}>₱{value.toFixed(2)}</span>;
};

const AnimatedNumber: React.FC<{ value: number }> = ({ value }) => {
  const nodeRef = useRef<HTMLSpanElement>(null);
  const prevValueRef = useRef(value);

  useEffect(() => {
    const node = nodeRef.current;
    if (!node) return;

    const controls = animate(prevValueRef.current, value, {
      duration: 0.8,
      ease: [0.16, 1, 0.3, 1],
      onUpdate(latest) {
        node.textContent = Math.round(latest).toString();
      },
      onComplete() {
        prevValueRef.current = value;
      }
    });

    return () => controls.stop();
  }, [value]);

  return <span ref={nodeRef}>{value}</span>;
};

const PAYMENT_FILTERS = [
  { label: 'All', value: 'All' },
  { label: 'Cash', value: 'Cash' },
  { label: 'GCash', value: 'GCash' }
];

const isTransactionDeletable = (tx: any) => {
  const todayStr = format(new Date(), 'yyyy-MM-dd');
  const txDate = tx.created_at ? format(new Date(tx.created_at), 'yyyy-MM-dd') : format(new Date(), 'yyyy-MM-dd');
  return txDate === todayStr;
};

const TransactionSkeleton: React.FC = () => {
  return (
    <div className="relative overflow-hidden rounded-2xl bg-(--bg-card) border border-(--border-color) p-4 sm:p-5 flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4 animate-pulse select-none">
      <div className="flex items-center gap-4 w-full md:w-auto min-w-0 flex-1">
        <div className="flex flex-col items-center gap-1.5 shrink-0">
          <div className="w-12 h-12 rounded-2xl bg-slate-100 dark:bg-zinc-800 border border-(--border-color)" />
          <div className="h-4 w-12 bg-slate-200/60 dark:bg-zinc-800/60 rounded mt-0.5" />
        </div>

        <div className="min-w-0 flex-1 text-left space-y-1.5">
          <div className="flex items-center gap-2 flex-wrap">
            <div className="h-4.5 w-40 sm:w-56 bg-slate-200/60 dark:bg-zinc-800/60 rounded" />
            <div className="h-4.5 w-16 bg-slate-100 dark:bg-zinc-800/80 rounded-full border border-(--border-color)" />
          </div>

          <div className="flex flex-wrap gap-1.5 pt-0.5">
            <div className="h-5 w-24 bg-slate-100/50 dark:bg-zinc-800/30 rounded-lg border border-(--border-color)" />
            <div className="h-5 w-32 bg-slate-100/50 dark:bg-zinc-800/30 rounded-lg border border-(--border-color)" />
          </div>

          <div className="flex items-center gap-1.5 flex-wrap pt-0.5">
            <div className="h-3 w-28 bg-slate-200/30 dark:bg-zinc-800/20 rounded" />
            <span className="text-slate-200 dark:text-zinc-800">•</span>
            <div className="h-3 w-16 bg-slate-200/30 dark:bg-zinc-800/20 rounded" />
          </div>
        </div>
      </div>

      <div className="hidden md:flex items-center gap-2 shrink-0">
        <div className="w-10.5 h-10.5 rounded-xl bg-slate-100 dark:bg-zinc-800 border border-(--border-color)" />
        <div className="w-10.5 h-10.5 rounded-xl bg-slate-100 dark:bg-zinc-800 border border-(--border-color)" />
      </div>
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
  const [paymentFilter, setPaymentFilter] = useState<'All' | 'Cash' | 'GCash'>('All');
  
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

  const [isMobileActionsOpen, setIsMobileActionsOpen] = useState(false);
  const [isRecycleBinOpen, setIsRecycleBinOpen] = useState(false);

  const [selectedProductsCount, setSelectedProductsCount] = useState(0);

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

  const dayTransactions = useMemo(() => {
    const dateStr = format(selectedDate, 'yyyy-MM-dd');
    return transactions.filter((t: any) => {
      const transactionDate = t.created_at ? format(new Date(t.created_at), 'yyyy-MM-dd') : '';
      return transactionDate === dateStr;
    });
  }, [selectedDate, transactions]);

  const filteredDayTransactions = useMemo(() => {
    return dayTransactions.filter((t: any) => {
      const q = ledgerSearch.toLowerCase().trim();
      const matchesSearch = q === '' ||
        t.product_name?.toLowerCase().includes(q) ||
        t.receipt_no?.toLowerCase().includes(q) ||
        t.id?.toLowerCase().includes(q) ||
        t.payment_method?.toLowerCase().includes(q) ||
        t.reference_number?.toLowerCase().includes(q);

      let matchesFilter = true;
      if (paymentFilter === 'Cash') {
        matchesFilter = (t.payment_method || '').toLowerCase().includes('cash') && !(t.payment_method || '').toLowerCase().includes('gcash');
      } else if (paymentFilter === 'GCash') {
        matchesFilter = (t.payment_method || '').toLowerCase().includes('gcash');
      }

      return matchesSearch && matchesFilter;
    });
  }, [dayTransactions, ledgerSearch, paymentFilter]);

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

  // Revenue dynamic scaling & color effect state
  const [revenueTrend, setRevenueTrend] = useState<'increasing' | 'decreasing' | 'neutral'>('neutral');
  const prevRevenueRef = useRef<number>(dailyRevenue);

  useEffect(() => {
    if (dailyRevenue > prevRevenueRef.current) {
      setRevenueTrend('increasing');
      const timer = setTimeout(() => {
        setRevenueTrend('neutral');
      }, 1500);
      prevRevenueRef.current = dailyRevenue;
      return () => clearTimeout(timer);
    } else if (dailyRevenue < prevRevenueRef.current) {
      setRevenueTrend('decreasing');
      const timer = setTimeout(() => {
        setRevenueTrend('neutral');
      }, 1500);
      prevRevenueRef.current = dailyRevenue;
      return () => clearTimeout(timer);
    }
    prevRevenueRef.current = dailyRevenue;
  }, [dailyRevenue]);

  const dailyCount = useMemo(() => {
    return dayTransactions.length;
  }, [dayTransactions]);

  const itemsSoldToday = useMemo(() => {
    return dayTransactions.reduce((acc, tx) => {
      if (tx.items && Array.isArray(tx.items) && tx.items.length > 0) {
        return acc + tx.items.reduce((sum: number, item: any) => sum + (Number(item.quantity) || 0), 0);
      }
      return acc + (Number(tx.quantity) || 1);
    }, 0);
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
          gcash_fee_applied: calculatedGcashFee,
          reference_number: newTx.referenceNumber || newTx.reference_number || null
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
    } finally {
      setLoading(false); 
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

  useEffect(() => {
    if ((activeView as string) === 'register') {
      setActions(
        <div className="flex flex-wrap items-center gap-3 w-full sm:w-auto justify-end animate-fade-in">
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
      if (selectedProductsCount > 0) {
        setActions(null);
      } else {
        setActions(
          <div className="flex flex-wrap items-center gap-3 w-full sm:w-auto justify-end animate-fade-in">
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
  }, [role, products, transactions, activeView, dailyRevenue, ratesConfig, selectedProductsCount, setActions]);

  return (
    <div className="relative min-h-[85vh] w-full animate-fade-in">
      <TabLoader isVisible={loading} />

      {/* --- DESKTOP NAVIGATION TABS --- */}
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
      <div className="relative w-full h-full min-h-[80vh] overflow-x-clip grid grid-cols-1 items-start">
        
        {/* VIEW 1: CASHIER REGISTER */}
        <div 
          className="w-full h-full space-y-6 max-w-4xl mx-auto px-1.5 sm:px-8 pb-36 animate-fade-in"
          style={{
            gridColumn: 1,
            gridRow: 1,
            transform: activeView === 'register' ? 'none' : 'translate3d(-101%, 0, 0)',
            opacity: activeView === 'register' ? 1 : 0,
            pointerEvents: activeView === 'register' ? 'auto' : 'none',
            transition: 'transform 800ms cubic-bezier(0.77, 0, 0.175, 1), opacity 800ms cubic-bezier(0.77, 0, 0.175, 1)'
          }}
        >
          {/* ─── TODAY'S SALES SUMMARY ─── */}
          <div className="bg-(--bg-card) border border-(--border-color) rounded-2xl px-4 sm:px-6 py-4 shadow-sm animate-fade-in">
            <div className="grid grid-cols-3 gap-2 sm:gap-4 items-center">
              
              {/* Transactions Metric (Left) */}
              <div className="flex flex-col sm:flex-row items-center justify-start gap-2 sm:gap-3 min-w-0">
                <div className="w-9 h-9 sm:w-11 sm:h-11 rounded-xl bg-blue-500/10 flex items-center justify-center shrink-0 border border-blue-500/20">
                  <ShoppingBag className="w-4.5 h-4.5 sm:w-5 sm:h-5 text-blue-500" />
                </div>
                <div className="min-w-0 text-center sm:text-left">
                  <span className="text-[9px] uppercase tracking-widest font-heading text-slate-500 dark:text-slate-400 block truncate font-bold">
                    Transactions
                  </span>
                  <span className="font-heading text-xl sm:text-3xl font-extrabold text-(--color-text) block leading-tight truncate">
                    <AnimatedNumber value={dailyCount} />
                  </span>
                  <span className="text-[10px] font-body text-slate-400 hidden sm:block truncate">
                    Completed Today
                  </span>
                </div>
              </div>

              {/* Today's Revenue Metric (Center Highlighted with FX) */}
              <div className="flex flex-col items-center justify-center text-center min-w-0 py-1 border-x border-(--border-color)/40 px-2 sm:px-4">
                <span className="text-[9px] sm:text-[10px] uppercase tracking-widest font-heading text-slate-500 dark:text-slate-400 block truncate font-bold">
                  Revenue
                </span>
                <motion.div
                  animate={{
                    scale: revenueTrend === 'increasing' ? 1.2 : revenueTrend === 'decreasing' ? 0.85 : 1,
                  }}
                  transition={{ type: 'spring', stiffness: 300, damping: 20 }}
                  className="my-1 flex items-center justify-center gap-1 sm:gap-1.5"
                >
                  <CircleDollarSign className={`w-4 h-4 sm:w-6 sm:h-6 transition-colors duration-300 ${
                    revenueTrend === 'increasing' ? 'text-emerald-500' : revenueTrend === 'decreasing' ? 'text-rose-500' : 'text-emerald-500'
                  }`} />
                  <span className={`font-heading text-xl sm:text-3xl md:text-4xl font-black tracking-tight transition-colors duration-500 truncate ${
                    revenueTrend === 'increasing'
                      ? 'text-emerald-500'
                      : revenueTrend === 'decreasing'
                      ? 'text-rose-500'
                      : 'text-(--color-text)'
                  }`}>
                    <AnimatedCurrency value={dailyRevenue} />
                  </span>
                </motion.div>
                <span className="text-[10px] font-body text-slate-400 hidden sm:block truncate">
                  Total Earnings
                </span>
              </div>

              {/* Items Sold Metric (Right) */}
              <div className="flex flex-col sm:flex-row items-center justify-end gap-2 sm:gap-3 min-w-0">
                <div className="min-w-0 text-center sm:text-right order-2 sm:order-1">
                  <span className="text-[9px] uppercase tracking-widest font-heading text-slate-500 dark:text-slate-400 block truncate font-bold">
                    Items Sold
                  </span>
                  <span className="font-heading text-xl sm:text-3xl font-extrabold text-(--color-text) block leading-tight truncate">
                    <AnimatedNumber value={itemsSoldToday} />
                  </span>
                  <span className="text-[10px] font-body text-slate-400 hidden sm:block truncate">
                    Units Dispatched
                  </span>
                </div>
                <div className="w-9 h-9 sm:w-11 sm:h-11 rounded-xl bg-emerald-500/10 flex items-center justify-center shrink-0 border border-emerald-500/20 order-1 sm:order-2">
                  <Package className="w-4.5 h-4.5 sm:w-5 sm:h-5 text-emerald-500" />
                </div>
              </div>

            </div>
          </div>

          <TimelineBar
            currentWeekStart={currentWeekStart}
            onWeekStartChange={setCurrentWeekStart}
            selectedDayIndex={selectedDayIndex}
            onDayIndexChange={setSelectedDayIndex}
            searchQuery={ledgerSearch}
            onSearchQueryChange={setLedgerSearch}
            activeFilter={paymentFilter}
            onFilterChange={setPaymentFilter}
            filterOptions={PAYMENT_FILTERS}
            role={role}
            searchPlaceholder="Search Transactions (Name, Receipt, Ref, Method)"
          />

          {/* --- HOURLY LEDGER TIMELINE --- */}
          <div className="space-y-6">
            <AnimatePresence mode="popLayout">
              {(() => {
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
                  const hasFilter = ledgerSearch.trim() !== '' || paymentFilter !== 'All';

                  return (
                    <motion.div
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      className="rounded-2xl border border-dashed border-(--border-color) p-12 text-center flex flex-col items-center justify-center bg-(--bg-card) shadow-xs animate-fade-in"
                    >
                      <div className="w-16 h-16 rounded-full bg-slate-100 dark:bg-zinc-900 flex items-center justify-center text-slate-455 dark:text-zinc-650 mb-4 animate-pulse">
                        {hasFilter ? <Search className="w-8 h-8" /> : <ShoppingBag className="w-8 h-8" />}
                      </div>
                      <h3 className="font-heading text-sm text-(--color-text) tracking-wider uppercase">
                        {hasFilter ? 'No sales match query' : 'NO TRANSACTIONS LOGGED'}
                      </h3>
                      <p className="text-xs text-slate-500 max-w-xs mx-auto mt-1 font-body">
                        {hasFilter
                          ? 'Try modifying your search keywords or clear search filter.'
                          : 'No purchases or entries have been recorded for this specific date slot.'}
                      </p>
                      {hasFilter && (
                        <button
                          type="button"
                          onClick={() => {
                            setLedgerSearch('');
                            setPaymentFilter('All');
                          }}
                          className="mt-4 px-4 py-2 bg-blue-500/10 text-blue-600 dark:text-blue-400 rounded-xl font-heading text-[10px] font-bold uppercase tracking-wider cursor-pointer border border-blue-500/20 hover:bg-blue-500/20 transition-colors"
                        >
                          Clear Filters
                        </button>
                      )}
                    </motion.div>
                  );
                }

                const handleDragEnd = (_event: any, info: any, tx: any) => {
                  const swipeThreshold = 80;
                  if (info.offset.x > swipeThreshold) {
                    setSelectedReceiptTx(tx);
                  } else if (info.offset.x < -swipeThreshold) {
                    if (isTransactionDeletable(tx)) {
                      handleDeleteTransaction(tx);
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
                        <TimelineCard
                          key={tx.id}
                          mode="sale"
                          data={tx}
                          canDelete={isTransactionDeletable(tx)}
                          onSelectReceipt={setSelectedReceiptTx}
                          onTriggerDelete={handleDeleteTransaction}
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

        {/* --- VIEW 2: PRODUCTS INVENTORY --- */}
        {role === 'admin' && (
          <div 
            className="w-full h-full pb-36 max-w-full"
            style={{
              gridColumn: 1,
              gridRow: 1,
              transform: activeView === 'inventory' ? 'none' : 'translate3d(101%, 0, 0)',
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
        <OfficialReceipt
          isOpen={!!selectedReceiptTx}
          onClose={() => setSelectedReceiptTx(null)}
          data={{
            receiptType: 'sales',
            receiptNo: selectedReceiptTx.receipt_no || selectedReceiptTx.id,
            customerName: 'Customer',
            items: (selectedReceiptTx.items || []).map((item: any) => ({
              productName: item.productName || item.product_name,
              quantity: item.quantity,
              price: item.price
            })),
            basePrice: selectedReceiptTx.items ? 0 : Number(selectedReceiptTx.total_amount || 0),
            gcashFee: Number(selectedReceiptTx.gcash_fee_applied || 0),
            paymentMethod: selectedReceiptTx.payment_method || selectedReceiptTx.paymentMethod || 'Cash',
            amountReceived: selectedReceiptTx.amount_received !== null && selectedReceiptTx.amount_received !== undefined ? Number(selectedReceiptTx.amount_received) : undefined,
            changeDue: Number(selectedReceiptTx.change_calculated || 0),
            gcashRefNo: selectedReceiptTx.reference_number || selectedReceiptTx.referenceNumber,
            transactionDate: selectedReceiptTx.created_at || selectedReceiptTx.createdAt,
            processedBy: 'Staff'
          }}
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

      {/* DETACHED CONFIRMATION NOTIFIER */}
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
                TODAY SUMMARY
              </span>
              <span className="text-xl font-heading text-(--color-primary) block leading-none pt-0.5">
                <AnimatedCurrency value={dailyRevenue} />
              </span>
              <span className="text-[9px] font-sans text-slate-500 block leading-none font-semibold">
                {dailyCount} Sales Recorded
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