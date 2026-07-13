// src/pages/sales/Sales.tsx
import React, { useState, useEffect, useMemo, useContext, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { 
  format, 
  startOfWeek, 
  endOfWeek, 
  addDays, 
  subDays, 
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
  Check, 
  ShoppingBag, 
  FileSpreadsheet,
  Printer 
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'react-toastify';

// UI Helpers
import { Button } from '../../components/ui/Button';
import { UndoToast } from '../../components/ui/UndoToast'; 
import { TabLoader } from '../../components/ui/TabLoader'; 
import { HeaderActionsContext } from '../../routes';
import { SalesDialog } from './components/SalesDialog';
import { Products } from './Products'; 
import { useResponsiveItemsPerPage } from '../../lib/useResponsiveItemsPerPage';
import { SalesRecycleBin } from './components/SalesRecycleBin';

// Separated Modular Components
import { SalesOfficialReceipt } from './components/SalesOfficialReceipt';
import { SalesReportCompiler } from './components/SalesReportCompiler';

// Explicitly type and define layout days loop
const DAYS_OF_WEEK: string[] = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];

const DEFAULT_PRODUCTS = [
  { id: 'p1', name: 'Whey Protein Shake', sellingPrice: 150, stock: 25, barcode: '10001', manufacturerBarcode: '4801234567890', image: '', hidden: false },
  { id: 'p2', name: 'Pre-Workout Energy Drink', sellingPrice: 120, stock: 40, barcode: '10002', manufacturerBarcode: '4802234567891', image: '', hidden: false },
  { id: 'p3', name: 'Palomar Gym Lift Straps', sellingPrice: 350, stock: 15, barcode: '10003', manufacturerBarcode: '4803234567892', image: '', hidden: false },
  { id: 'p4', name: 'Mineral Water (500ml)', sellingPrice: 25, stock: 100, barcode: '10004', manufacturerBarcode: '4804234567893', image: '', hidden: false },
  { id: 'p5', name: 'Creatine Monohydrate (300g)', sellingPrice: 950, stock: 10, barcode: '10005', manufacturerBarcode: '4805234567894', image: '', hidden: false },
  { id: 'p6', name: 'Premium Gym Towel', sellingPrice: 250, stock: 0, barcode: '10006', manufacturerBarcode: '4806234567895', image: '', hidden: false },
];

// --- GLOBAL TODAY TRANSACTION ONLY ROLLBACK FILTER ---
const isTransactionDeletable = (tx: any) => {
  const todayStr = format(new Date(), 'yyyy-MM-dd');
  return tx.date === todayStr;
};

const seedDataIfEmpty = () => {
  if (!localStorage.getItem('products')) {
    localStorage.setItem('products', JSON.stringify(DEFAULT_PRODUCTS));
  }
  if (!localStorage.getItem('transactions')) {
    const today = new Date();
    const yesterday = subDays(today, 1);
    const threeDaysAgo = subDays(today, 3);

    const defaultTransactions = [
      {
        id: 'TX-90210',
        items: [
          { productId: 'p1', productName: 'Whey Protein Shake', quantity: 2, price: 150 }
        ],
        productName: '2x Whey Protein Shake',
        barcode: '10001',
        quantity: 2,
        paymentMethod: 'Cash',
        amountReceived: 300,
        changeCalculated: 0,
        totalAmount: 300,
        createdAt: format(today, "yyyy-MM-dd'T'14:22:00"),
        date: format(today, 'yyyy-MM-dd'),
      },
      {
        id: 'TX-90211',
        items: [
          { productId: 'p2', productName: 'Pre-Workout Energy Drink', quantity: 1, price: 120 }
        ],
        productName: '1x Pre-Workout Energy Drink',
        barcode: '10002',
        quantity: 1,
        paymentMethod: 'GCash',
        referenceNumber: 'REF-119381A',
        totalAmount: 120,
        createdAt: format(today, "yyyy-MM-dd'T'10:15:00"),
        date: format(today, 'yyyy-MM-dd'),
      },
      {
        id: 'TX-90212',
        items: [
          { productId: 'p4', productName: 'Mineral Water (500ml)', quantity: 4, price: 25 }
        ],
        productName: '4x Mineral Water (500ml)',
        barcode: '10004',
        quantity: 4,
        paymentMethod: 'Cash',
        amountReceived: 100,
        changeCalculated: 0,
        totalAmount: 100,
        createdAt: format(yesterday, "yyyy-MM-dd'T'16:45:00"),
        date: format(yesterday, 'yyyy-MM-dd'),
      },
      {
        id: 'TX-90213',
        items: [
          { productId: 'p3', productName: 'Palomar Gym Lift Straps', quantity: 1, price: 350 }
        ],
        productName: '1x Palomar Gym Lift Straps',
        barcode: '10003',
        quantity: 1,
        paymentMethod: 'GCash',
        referenceNumber: 'REF-229103B',
        totalAmount: 350,
        createdAt: format(yesterday, "yyyy-MM-dd'T'11:05:00"),
        date: format(yesterday, 'yyyy-MM-dd'),
      },
      {
        id: 'TX-90214',
        items: [
          { productId: 'p5', productName: 'Creatine Monohydrate (300g)', quantity: 1, price: 950 }
        ],
        productName: '1x Creatine Monohydrate (300g)',
        barcode: '10005',
        quantity: 1,
        paymentMethod: 'Cash',
        amountReceived: 1000,
        changeCalculated: 50,
        totalAmount: 950,
        createdAt: format(threeDaysAgo, "yyyy-MM-dd'T'09:30:00"),
        date: format(threeDaysAgo, 'yyyy-MM-dd'),
      },
    ];
    localStorage.setItem('transactions', JSON.stringify(defaultTransactions));
  }
};

export const Sales: React.FC = () => {
  const { setActions } = useContext(HeaderActionsContext);
  const [isMobileProductsMenuOpen, setIsMobileProductsMenuOpen] = useState(false);
  const navigate = useNavigate();
  const { subview } = useParams<{ subview: string }>();

  // activeView is derived from URL parameters to avoid resets during transitions
  const activeView = useMemo<'register' | 'inventory'>(() => {
    return subview === 'products' ? 'inventory' : 'register';
  }, [subview]);

  // --- STATE FOR ROLE SIMULATION ---
  const [role, setRole] = useState<'admin' | 'staff'>('admin');

  // --- LEDGER TIMELINE STATES ---
  const [currentWeekStart, setCurrentWeekStart] = useState<Date>(() => 
    startOfWeek(new Date(), { weekStartsOn: 0 })
  );
  const [selectedDayIndex, setSelectedDayIndex] = useState<number>(() => getDay(new Date()));
  const [ledgerSearch, setLedgerSearch] = useState('');
  
  // --- INVENTORY & TRANSACTION LOGS ---
  const [transactions, setTransactions] = useState<any[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  // Pagination hook values
  const itemsPerPage = useResponsiveItemsPerPage();
  const [currentPage, setCurrentPage] = useState(1);

  // POS Dialog toggle state
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);

  // Receipt Modal target state
  const [selectedReceiptTx, setSelectedReceiptTx] = useState<any | null>(null);

  // --- UNDO TOAST STATE STAGING ---
  const [stagedDeletedTx, setStagedDeletedTx] = useState<any | null>(null);
  const [isUndoToastOpen, setIsUndoToastOpen] = useState(false);

  // --- DYNAMIC SALES REPORT COMPILER TOGGLE ---
  const [isReportModalOpen, setIsReportModalOpen] = useState(false);

  // Reference for the hidden Native date picker
  const dateInputRef = useRef<HTMLInputElement>(null);

  // Sync back to Topbar if we toggle view via PC boundaries or header slider
  const handlePcViewTransition = (view: 'register' | 'inventory') => {
    if (view === 'inventory') {
      navigate('/sales/products');
    } else {
      navigate('/sales/register');
    }
  };

  const handleDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.value) return;
    const pickedDate = new Date(e.target.value);
    
    // Enforce role-based lockouts
    if (!isTabSelectable(pickedDate)) {
      toast.warning(role === 'staff' ? 'Staff can only select today.' : 'Future dates are locked.');
      return;
    }

    const newWeekStart = startOfWeek(pickedDate, { weekStartsOn: 0 });
    const dayIndex = getDay(pickedDate);

    setCurrentWeekStart(newWeekStart);
    setSelectedDayIndex(dayIndex);
  };

  const [isMobileActionsOpen, setIsMobileActionsOpen] = useState(false);
  const [isRecycleBinOpen, setIsRecycleBinOpen] = useState(false);
  const [, setDeletedTransactions] = useState<any[]>([]);

  // Load deleted transactions on mount
  useEffect(() => {
    const deleted = localStorage.getItem('deleted_transactions') || '[]';
    setDeletedTransactions(JSON.parse(deleted));
  }, []);

  // Listen to Topbar mobile slide toggles
  useEffect(() => {
    const handleSalesSlide = (e: Event) => {
      const customEvent = e as CustomEvent<'register' | 'inventory'>;
      if (customEvent.detail === 'inventory') {
        navigate('/sales/products');
      } else {
        navigate('/sales/register');
      }
    };
    window.addEventListener('toggle-sales-view', handleSalesSlide);
    return () => window.removeEventListener('toggle-sales-view', handleSalesSlide);
  }, [navigate]);

  // Load Data
  const loadLocalStorageData = () => {
    const tx = localStorage.getItem('transactions') || '[]';
    const prod = localStorage.getItem('products') || '[]';
    setTransactions(JSON.parse(tx));
    setProducts(JSON.parse(prod));
  };

  useEffect(() => {
    seedDataIfEmpty();
    loadLocalStorageData();
  }, []);

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
    setCurrentPage(1); // Reset page on day select
  }, [currentWeekStart, role]);

  const selectedDate = useMemo(() => {
    return addDays(currentWeekStart, selectedDayIndex);
  }, [currentWeekStart, selectedDayIndex]);

  // SELECTED WEEK DATE RANGE FOR ADMIN, DAY FOR STAFF
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

  // Ledger Filter logic
  const dayTransactions = useMemo(() => {
    const dateStr = format(selectedDate, 'yyyy-MM-dd');
    return transactions.filter((t: any) => t.date === dateStr);
  }, [selectedDate, transactions]);

  const filteredDayTransactions = useMemo(() => {
    return dayTransactions.filter((t: any) => {
      const q = ledgerSearch.toLowerCase();
      return (
        t.productName?.toLowerCase().includes(q) ||
        t.barcode?.toLowerCase().includes(q) ||
        t.id?.toLowerCase().includes(q) ||
        (t.referenceNumber && t.referenceNumber.toLowerCase().includes(q)) ||
        t.paymentMethod?.toLowerCase().includes(q)
      );
    });
  }, [dayTransactions, ledgerSearch]);

  // AUTO-PAGINATION SLICING
  const totalItems = filteredDayTransactions.length;
  const totalPages = Math.ceil(totalItems / itemsPerPage) || 1;
  const clampedPage = Math.min(Math.max(currentPage, 1), totalPages);

  const paginatedTransactions = useMemo(() => {
    const startIdx = (clampedPage - 1) * itemsPerPage;
    return filteredDayTransactions.slice(startIdx, startIdx + itemsPerPage);
  }, [filteredDayTransactions, clampedPage, itemsPerPage]);

  const startIndex = (clampedPage - 1) * itemsPerPage;

  const dailyRevenue = useMemo(() => {
    return dayTransactions.reduce((acc, t) => acc + (t.totalAmount || 0), 0);
  }, [dayTransactions]);

  const dailyCount = useMemo(() => {
    return dayTransactions.length;
  }, [dayTransactions]);

  const handleSaleSuccess = (newTx: any, updatedProductsList: any[]) => {
    setLoading(true);
    setTimeout(() => {
      localStorage.setItem('products', JSON.stringify(updatedProductsList));
      const allTx = [newTx, ...transactions];
      localStorage.setItem('transactions', JSON.stringify(allTx));

      loadLocalStorageData();
      setLoading(false);
      toast.success('Sales transaction committed to ledger.');
    }, 600);
  };

  const handleDeleteTransaction = (tx: any) => {
    if (!isTransactionDeletable(tx)) {
      toast.error('Rollback Lock: Only current day sales may be deleted.');
      return;
    }

    setStagedDeletedTx(tx);
    setIsUndoToastOpen(true);

    setTransactions(prev => prev.filter(t => t.id !== tx.id));
  };

  const handleConfirmDelete = () => {
    if (!stagedDeletedTx) return;

    // Move to permanently deleted list in localStorage
    const txString = localStorage.getItem('transactions') || '[]';
    const allTx = JSON.parse(txString);
    const updatedTx = allTx.filter((t: any) => t.id !== stagedDeletedTx.id);
    localStorage.setItem('transactions', JSON.stringify(updatedTx));

    // SAVE TO DAILY RECYCLE BIN
    const deletedString = localStorage.getItem('deleted_transactions') || '[]';
    const deletedTxList = JSON.parse(deletedString);
    
    // Append current deletion
    const archivedTx = { ...stagedDeletedTx, archivedAt: new Date().toISOString() };
    deletedTxList.unshift(archivedTx);
    localStorage.setItem('deleted_transactions', JSON.stringify(deletedTxList));
    setDeletedTransactions(deletedTxList);

    // Restore Stock
    const restoredProducts = products.map((p: any) => {
      const txItems = stagedDeletedTx.items || [{ productId: stagedDeletedTx.productId, quantity: stagedDeletedTx.quantity }];
      const matchedItem = txItems.find((item: any) => item.productId === p.id);
      if (matchedItem) {
        const stock = p.stock_quantity !== undefined ? p.stock_quantity : (p.stock !== undefined ? p.stock : -1);
        if (stock !== null && stock !== undefined && stock !== -1) {
          const restoredStock = stock + matchedItem.quantity;
          return p.stock_quantity !== undefined ? { ...p, stock_quantity: restoredStock } : { ...p, stock: restoredStock };
        }
      }
      return p;
    });
    localStorage.setItem('products', JSON.stringify(restoredProducts));

    setStagedDeletedTx(null);
    setIsUndoToastOpen(false);
    loadLocalStorageData();
    toast.success('Transaction deleted. Stored in daily Recycle Bin.');
  };

  const handleUndoDelete = () => {
    if (!stagedDeletedTx) return;
    
    setTransactions(prev => [stagedDeletedTx, ...prev].sort((a, b) => b.createdAt.localeCompare(a.createdAt)));
    setStagedDeletedTx(null);
    setIsUndoToastOpen(false);
    toast.info('Deletion rolled back.');
  };

  // Connect Top bar actions dynamically
  useEffect(() => {
    if ((activeView as string) === 'register') {
      setActions(
        <div className="flex flex-wrap items-center gap-3 w-full sm:w-auto justify-end animate-fade-in">
          
         {/* PERSISTENT DAILY REVENUE CHIP (PC ONLY) */}
<div className="hidden lg:flex items-center gap-3 px-5 py-2 bg-slate-100 dark:bg-zinc-900 border border-(--border-color) rounded-2xl select-none leading-none shadow-sm shrink-0 animate-fade-in">
  <div className="text-left">
    <span className="text-[9px] font-heading tracking-widest text-slate-400 dark:text-slate-500 block uppercase">TODAY'S SALES</span>
    <span className="text-lg font-heading text-(--color-primary) block mt-1.5 tracking-wider">
      ₱{dailyRevenue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
    </span>
  </div>
</div>

          {/* SIMULATION CONTROLS */}
          <div className="flex bg-slate-200 dark:bg-zinc-800 p-1 rounded-xl text-xs font-bold gap-1 shadow-inner select-none">
            <button
              type="button"
              onClick={() => { setRole('admin'); toast.info('Simulating Admin View'); }}
              className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
                role === 'admin' 
                  ? 'bg-[#123c73] dark:bg-[#bf0202] text-white shadow-md font-bold' 
                  : 'text-slate-505 dark:text-slate-400 hover:text-(--color-text)'
              }`}
            >
              ADMIN
            </button>
            <button
              type="button"
              onClick={() => { setRole('staff'); toast.info('Simulating Staff View'); }}
              className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
                role === 'staff' 
                  ? 'bg-[#123c73] dark:bg-[#bf0202] text-white shadow-md font-bold' 
                  : 'text-slate-505 dark:text-slate-400 hover:text-(--color-text)'
              }`}
            >
              STAFF
            </button>
          </div>

          {role === 'admin' && (
            <>
              {/* RECYCLE BIN ON PC */}
              <Button
                onClick={() => setIsRecycleBinOpen(true)}
                variant="secondary"
                className="py-2 px-3.5 w-auto! text-xs flex items-center gap-1.5 cursor-pointer font-bold animate-fade-in"
                title="View and restore today's deleted transactions"
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
      // RENDER PRODUCTS INVENTORY HEADER ACTIONS WHEN SWITCHED TO INVENTORY VIEW
      setActions(
        <div className="flex flex-wrap items-center gap-3 w-full sm:w-auto justify-end animate-fade-in">
          
          {/* PERSISTENT DAILY REVENUE CHIP (PC ONLY) */}
          <div className="hidden lg:flex items-center gap-2 px-3.5 py-1.5 bg-slate-100 dark:bg-zinc-900 border border-(--border-color) rounded-xl select-none leading-none">
            <div className="text-left">
              <span className="text-[7px] font-heading tracking-widest text-slate-400 dark:text-slate-500 block uppercase">TODAY'S SALES</span>
              <span className="text-xs font-heading text-(--color-primary) block mt-1">
                ₱{dailyRevenue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
            </div>
          </div>

          <button
            onClick={() => setIsRecycleBinOpen(true)}
            className="flex items-center gap-2 px-4 py-2 bg-slate-100 dark:bg-[#161920] hover:bg-slate-200 dark:hover:bg-[#1e232d] text-(--color-text) border border-(--border-color) text-[10px] font-heading tracking-widest uppercase rounded-lg transition-all cursor-pointer"
          >
            <RotateCcw className="w-3.5 h-3.5 text-amber-500" />
            <span>Recycle Bin</span>
          </button>

          <button
            onClick={() => window.dispatchEvent(new CustomEvent('trigger-product-print'))}
            className="flex items-center gap-2 px-4 py-2 bg-[#1e232d] hover:bg-slate-800 text-white border border-white/5 text-[10px] font-heading tracking-widest uppercase rounded-lg transition-all cursor-pointer"
          >
            <Printer className="w-3.5 h-3.5 text-blue-500" />
            <span>Print Sheet Labels</span>
          </button>

          <button
            onClick={() => window.dispatchEvent(new CustomEvent('trigger-product-create'))}
            className="flex items-center gap-2 px-4 py-2 bg-emerald-500 text-white hover:bg-emerald-600 text-[10px] font-heading tracking-widest uppercase rounded-lg transition-all cursor-pointer shadow-lg"
          >
            <Plus className="w-3.5 h-3.5" />
            Add New Item
          </button>
        </div>
      );
    }

    return () => setActions(null);
  }, [role, products, transactions, activeView, dailyRevenue]);

  return (
    <div className="relative min-h-[85vh] w-full animate-fade-in">
      <TabLoader isVisible={loading} />

      {/* --- DESKTOP QUICK-VIEW SIDEBAR NAVIGATION TABS (PC ONLY) --- */}
      <div className="hidden xl:block">
        <AnimatePresence>
          {(activeView as string) === 'register' ? (
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

      {/* --- PC/MOBILE ADAPTIVE SLIDER CANVAS --- */}
      <div className="relative w-full h-full min-h-[80vh] overflow-hidden grid grid-cols-1 items-start">
        
        {/* --- VIEW 1: CASHIER REGISTER (Slides out to the left) --- */}
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
          {/* --- WEEKLY TIMELINE SCROLLER STICKY CARD CONTAINER --- */}
          <div className="sticky top-0 z-30 bg-(--bg-page)/95 backdrop-blur-md pt-2 pb-4 -mx-6 px-6 sm:-mx-12 sm:px-12 border-b border-(--border-color) shadow-xs flex flex-col gap-4 animate-slide-down">
            <div className="flex items-center justify-between gap-2">
              
              {role === 'admin' ? (
                <button
                  onClick={() => setCurrentWeekStart(prev => subWeeks(prev, 1))}
                  className="p-2 border border-(--border-color) rounded-xl hover:bg-slate-100 dark:hover:bg-zinc-800 disabled:opacity-40 transition-all cursor-pointer"
                >
                  <ChevronLeft className="w-5 h-5 text-[var(--color-text)]" />
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
                  {/* DISPLAY THE EXACT SELECTED DAY DATE */}
                  <span className="font-heading text-xs sm:text-sm text-(--color-primary-light) tracking-wider block mt-0.5">
                    {stickyHeaderDateText}
                  </span>
                  
                  {/* Hidden Native Picker */}
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
                    <ChevronRight className="w-5 h-5 text-[var(--color-text)]" />
                  </button>
                ) : (
                  <div className="w-10 h-10 hidden sm:block" /> 
                )}
              </div>
            </div>

            {/* DAY SELECTION TABS SUN - SAT */}
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

          {/* --- SEARCH TOOLBAR: Sits directly below the sticky weekly timeline scroller card --- */}
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
              Search Transactions (Name, Barcode, TX-ID, Ref No, Method)
            </label>
            {ledgerSearch && (
              <button 
                onClick={() => setLedgerSearch('')} 
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 text-xs font-bold"
              >
                CLEAR
              </button>
            )}
          </div>

          {/* --- TIMELINE CHRONOLOGY CARD LEDGER --- */}
          <div className="space-y-3">
            <AnimatePresence mode="popLayout">
              {paginatedTransactions.length > 0 ? (
                paginatedTransactions.map((tx: any) => {
                  const formattedTime = tx.createdAt ? format(parseISO(tx.createdAt), 'hh:mm a') : 'N/A';
                  const canDeleteTx = isTransactionDeletable(tx); // Only allow today deletions

                  return (
                    <motion.div
                      key={tx.id}
                      onClick={() => setSelectedReceiptTx(tx)}
                      initial={{ opacity: 0, y: 10, scale: 0.98 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.95 }}
                      transition={{ duration: 0.15 }}
                      className="rounded-2xl border border-(--border-color) bg-(--bg-card) p-4 sm:p-5 shadow-sm hover:shadow-md transition-all flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 cursor-pointer hover:border-(--color-primary)/50"
                    >
                      <div className="flex items-center gap-4 w-full sm:w-auto">
                        <div className="w-12 h-12 rounded-xl bg-slate-100 dark:bg-zinc-800 flex items-center justify-center text-(--color-primary) font-heading shrink-0 border border-(--border-color)">
                          {tx.productName?.substring(0, 2).toUpperCase()}
                        </div>
                        <div className="min-w-0 flex-1 text-left">
                          <div className="flex items-center gap-2 flex-wrap">
                            <h4 className="text-sm font-bold text-(--color-text) truncate">{tx.productName}</h4>
                            <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-100 dark:bg-zinc-800 text-slate-500 font-sans tracking-wider border border-(--border-color)">{tx.id}</span>
                          </div>
                          <div className="text-[11px] text-slate-500 dark:text-slate-400 font-mono mt-1 flex items-center gap-1 flex-wrap">
                            <span className="truncate max-w-50">Barcode: {tx.barcode}</span>
                            <span className="text-slate-300 dark:text-zinc-700">•</span>
                            <span>Time: {formattedTime}</span>
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center justify-between sm:justify-end gap-5 w-full sm:w-auto border-t sm:border-0 border-(--border-color) pt-3 sm:pt-0">
                        <div className="text-left sm:text-right">
                          <div className="text-xs font-sans text-slate-500 dark:text-slate-400">
                            {tx.quantity} unit{tx.quantity > 1 ? 's' : ''} × {tx.paymentMethod}
                          </div>
                          <div className="text-base font-heading text-(--color-text) mt-0.5">
                            ₱{tx.totalAmount?.toFixed(2)}
                          </div>
                          {tx.referenceNumber && (
                            <div className="text-[9px] text-emerald-600 dark:text-emerald-400 font-mono flex items-center gap-0.5">
                              <Check className="w-3.5 h-3.5" /> {tx.referenceNumber}
                            </div>
                          )}
                        </div>

                        {/* CONDITIONAL TRASH DELETE ACTION - HIDES IF PAST OR FUTURE */}
                        {canDeleteTx && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDeleteTransaction(tx);
                            }}
                            className="p-3 text-red-500 dark:text-rose-400 hover:bg-red-500/10 rounded-xl transition-all border border-transparent hover:border-red-500/20 cursor-pointer"
                            title="Rollback transaction"
                          >
                            <Trash2 className="w-4.5 h-4.5" />
                          </button>
                        )}
                      </div>
                    </motion.div>
                  );
                })
              ) : (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="rounded-2xl border border-dashed border-(--border-color) p-12 text-center flex flex-col items-center justify-center"
                >
                  <div className="w-16 h-16 rounded-full bg-slate-100 dark:bg-zinc-900 flex items-center justify-center text-slate-400 dark:text-zinc-600 mb-4 animate-pulse">
                    <ShoppingBag className="w-8 h-8" />
                  </div>
                  <h3 className="font-heading text-sm text-(--color-text) tracking-wider">NO TRANSACTIONS LOGGED</h3>
                  <p className="text-xs text-slate-500 max-w-xs mx-auto mt-1 font-body">
                    No purchases or entries have been recorded for this specific date slot.
                  </p>
                </motion.div>
              )}
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

        {/* --- MOBILE PRODUCTS STICKY FLOATING FAB (ONLY IN INVENTORY VIEW) --- */}
{(activeView as string) === 'inventory' && (
  <>
    {/* Floating Backdrop for Menu Focus */}
    <AnimatePresence>
      {isMobileProductsMenuOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={() => setIsMobileProductsMenuOpen(false)}
          className="md:hidden fixed inset-0 bg-black/60 backdrop-blur-xs z-35"
        />
      )}
    </AnimatePresence>

    {/* Floating Actions Menu Panel */}
    <div className="md:hidden fixed bottom-36 right-6 z-40 flex flex-col items-end gap-3.5">
      <AnimatePresence>
        {isMobileProductsMenuOpen && (
          <motion.div 
            initial={{ opacity: 0, y: 15, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 15, scale: 0.9 }}
            className="flex flex-col items-end gap-2.5 mb-1"
          >
            {/* Action 1: Recycle Bin */}
            <button
              onClick={() => {
                setIsMobileProductsMenuOpen(false);
                window.dispatchEvent(new CustomEvent('trigger-product-recovery'));
              }}
              className="flex items-center gap-2.5 px-4 py-2.5 bg-slate-900/95 dark:bg-neutral-900/95 text-slate-100 border border-white/5 text-[9px] font-heading tracking-widest uppercase rounded-2xl shadow-xl cursor-pointer"
            >
              <RotateCcw className="w-4 h-4 text-amber-500" />
              <span>Recycle Bin</span>
            </button>

            {/* Action 2: Print Sheet Labels */}
            <button
              onClick={() => {
                setIsMobileProductsMenuOpen(false);
                window.dispatchEvent(new CustomEvent('trigger-product-print'));
              }}
              className="flex items-center gap-2.5 px-4 py-2.5 bg-slate-900/95 dark:bg-neutral-900/95 text-slate-100 border border-white/5 text-[9px] font-heading tracking-widest uppercase rounded-2xl shadow-xl cursor-pointer"
            >
              <Printer className="w-4 h-4 text-blue-500" />
              <span>Print Labels</span>
            </button>
            
            {/* Action 3: Add Product */}
            <button
              onClick={() => {
                setIsMobileProductsMenuOpen(false);
                window.dispatchEvent(new CustomEvent('trigger-product-create'));
              }}
              className="flex items-center gap-2.5 px-4 py-2.5 bg-slate-900/95 dark:bg-neutral-900/95 text-slate-100 border border-white/5 text-[9px] font-heading tracking-widest uppercase rounded-2xl shadow-xl cursor-pointer"
            >
              <Plus className="w-4 h-4 text-emerald-500" />
              <span>Add Product</span>
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>

    {/* Primary Mobile FAB Trigger (Sticky bottom right, perfectly above bottom navigation) */}
    <div className="md:hidden fixed bottom-24 right-4 z-40">
      <motion.button
        type="button"
        whileTap={{ scale: 0.9 }}
        onClick={() => setIsMobileProductsMenuOpen(!isMobileProductsMenuOpen)}
        animate={{ rotate: isMobileProductsMenuOpen ? 135 : 0 }}
        className="flex items-center justify-center w-12 h-12 text-white rounded-full cursor-pointer bg-[#10b981] hover:bg-[#0c2950] border border-white/10 shadow-lg"
        title="Add product items"
      >
        <Plus className="w-5.5 h-5.5" />
      </motion.button>
    </div>
  </>
)}

        {/* --- VIEW 2: PRODUCTS INVENTORY (Slides in from the right) --- */}
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
          {/* FIXED NESTING LOCK FLAG: Disables products list from registering duplicate top bar buttons */}
          <Products hideHeaderActions={true} />
        </div>

      </div>

      {/* --- SEPARATED CREATE TRANSACTION MODAL DIALOG --- */}
      {isCreateModalOpen && (
        <SalesDialog
          isOpen={isCreateModalOpen}
          onClose={() => setIsCreateModalOpen(false)}
          products={products}
          onSaleSuccess={handleSaleSuccess}
        />
      )}

      {/* --- MOUNTED OUTSOURCED REPORTS COMPILER OVERLAY DIALOG --- */}
      {isReportModalOpen && (
        <SalesReportCompiler
          isOpen={isReportModalOpen}
          onClose={() => setIsReportModalOpen(false)}
          transactions={transactions}
        />
      )}

      {/* --- MOUNTED OUTSOURCED RECEIPTS OVERLAY DIALOG --- */}
      {selectedReceiptTx && (
        <SalesOfficialReceipt
          isOpen={!!selectedReceiptTx}
          onClose={() => setSelectedReceiptTx(null)}
          tx={selectedReceiptTx}
        />
      )}

      {/* --- DAILY RECYCLE BIN MODAL DIALOG --- */}
      {isRecycleBinOpen && (
        <SalesRecycleBin
          isOpen={isRecycleBinOpen}
          onClose={() => setIsRecycleBinOpen(false)}
          products={products}
          onRestoreSuccess={() => {
            loadLocalStorageData(); // Automatically reloads ledger logs & metrics
          }}
        />
      )}

      {/* --- DETACHED RESILIENT UNDO TOAST NOTIFIER --- */}
      <UndoToast
        isOpen={isUndoToastOpen}
        message={stagedDeletedTx ? `Removing transaction ${stagedDeletedTx.id} from ledger database...` : ''}
        duration={5}
        onConfirm={handleConfirmDelete}
        onUndo={handleUndoDelete}
        onClose={() => setIsUndoToastOpen(false)}
      />

      {/* --- RESPONSIVE MOBILE STICKY FLOATING BOTTOM-BAR --- */}
      {(activeView as string) === 'register' && (
        <>
          {/* Floating Backdrop for Menu Focus */}
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

          {/* Floating Actions Menu Panel */}
          <div className="md:hidden fixed bottom-36 right-6 z-40 flex flex-col items-end gap-3.5">
            <AnimatePresence>
              {isMobileActionsOpen && (
                <motion.div 
                  initial={{ opacity: 0, y: 15, scale: 0.9 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 15, scale: 0.9 }}
                  className="flex flex-col items-end gap-2.5 mb-1"
                >
                  {/* Action 1: Recycle Bin */}
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

                  {/* Action 2: Generate Report */}
                  <button
                    onClick={() => { setIsMobileActionsOpen(false); setIsReportModalOpen(true); }}
                    className="flex items-center gap-2.5 px-4 py-2.5 bg-slate-900/95 dark:bg-neutral-900/95 text-slate-100 border border-white/5 text-[9px] font-heading tracking-widest uppercase rounded-2xl shadow-xl cursor-pointer"
                  >
                    <FileSpreadsheet className="w-4 h-4 text-emerald-500" />
                    <span>Generate Report</span>
                  </button>
                  
                  {/* Action 3: New Sale */}
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

          {/* Bottom Bar Content wrapper */}
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

            {/* Primary Mobile FAB Trigger */}
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
    </div>
  );
};

export default Sales;